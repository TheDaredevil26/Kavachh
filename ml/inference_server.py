"""
FastAPI Inference Server for Kavach ML / Fraud Detection Service.
Provides HTTP /infer endpoint and Redis pub/sub listener for real-time fraud scoring.
"""

import asyncio
import json
import logging
import os
import sys
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Prevent matplotlib cache permission errors in sandboxed environments
os.environ.setdefault("MPLCONFIGDIR", tempfile.gettempdir())

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
import redis.asyncio as aioredis
from pymongo import MongoClient

# Local import resolution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import features

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ml_inference")

CONTRACT_VERSION = "1.0"
MODEL_VERSION = "v1"

MODEL_PATH = os.getenv("MODEL_PATH", os.path.join(BASE_DIR, "data", "models", "fraud_detector_v1.pkl"))
SCALER_PATH = os.getenv("SCALER_PATH", os.path.join(BASE_DIR, "data", "models", "scaler_v1.pkl"))
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/kavach")

# Global artifacts
model = None
scaler = None
explainer = None
mongo_client = None
mongo_db = None


def load_artifacts():
    """Loads the trained model, scaler, and SHAP explainer."""
    global model, scaler, explainer
    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            scaler = joblib.load(SCALER_PATH)
            logger.info(f"Loaded ML model from {MODEL_PATH} and scaler from {SCALER_PATH}")
            try:
                import shap
                explainer = shap.TreeExplainer(model)
                logger.info("Initialized SHAP TreeExplainer for feature attribution")
            except Exception as e:
                logger.warning(f"SHAP TreeExplainer initialization skipped: {e}")
                explainer = None
        except Exception as e:
            logger.error(f"Error loading model artifacts: {e}")
    else:
        logger.warning(f"Model artifacts not found at {MODEL_PATH} or {SCALER_PATH}.")


def get_mongo_collection():
    """Lazy-connects to MongoDB ml_prediction_log collection."""
    global mongo_client, mongo_db
    if mongo_client is None:
        try:
            mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=500)
            mongo_db = mongo_client.get_default_database()
        except Exception as e:
            logger.debug(f"MongoDB connection unavailable: {e}")
            return None
    try:
        return mongo_db["ml_prediction_log"]
    except Exception:
        return None


# ---------- Pydantic Request & Response Schemas ----------
class ClaimInferenceRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    contract_version: str = CONTRACT_VERSION
    correlation_id: str
    claim_id: str
    tenant_id: Optional[str] = "default"
    worker_id: Optional[str] = "unknown"
    trigger_event_id: Optional[str] = "unknown"

    # GPS Plausibility fields
    gps_lat: Optional[float] = 28.6139
    gps_lng: Optional[float] = 77.2090
    gps_jitter_score: Optional[float] = None
    velocity_plausible: Optional[float] = None
    pre_trigger_active: Optional[float] = None

    # Activity & Pattern fields
    delivery_history_hours: Optional[float] = None
    registration_age_days: Optional[float] = None
    registration_ip_cluster: Optional[float] = None
    zone_claim_rate: Optional[float] = None
    burst_flag: Optional[float] = None

    # Telemetry and raw sensor context
    pre_trigger_gps_history: Optional[List[Dict[str, Any]]] = None
    qr_checkin_within_window: Optional[bool] = False
    zone_claims_last_3min: Optional[int] = 0
    zone_claim_count: Optional[int] = 0
    zone_total_workers: Optional[int] = 0
    last_delivery_timestamp: Optional[str] = None
    registration_timestamp: Optional[str] = None
    claim_timestamp: Optional[str] = None


class ClaimInferenceResponse(BaseModel):
    contract_version: str = CONTRACT_VERSION
    model_version: str = MODEL_VERSION
    correlation_id: str
    claim_id: str
    fraud_probability: float = Field(ge=0.0, le=1.0)
    features: Dict[str, float]
    signals: List[Dict[str, Any]]
    shap_top_factors: List[Dict[str, Any]] = []


# ---------- Core Scoring Logic ----------
def score(req: ClaimInferenceRequest) -> ClaimInferenceResponse:
    """
    Computes fraud probability, feature map, layer signals, and SHAP top factors.
    """
    global model, scaler, explainer
    if model is None or scaler is None:
        load_artifacts()
    if model is None or scaler is None:
        raise RuntimeError("ML model or scaler is not loaded. Run train.py first.")

    # 1. Extract standard 8-feature vector
    vec = features.extract(req)

    # 2. Scale features (using DataFrame to preserve feature names)
    x_df = pd.DataFrame([vec], columns=features.FEATURES)
    scaled = scaler.transform(x_df)

    # 3. Predict fraud probability (class 1)
    prob = float(model.predict_proba(scaled)[0][1])

    # 4. Extract per-layer signals
    signals = features.extract_signals(req, vec)

    # 5. Compute SHAP top factors if explainer is available
    shap_factors: List[Dict[str, Any]] = []
    if explainer is not None:
        try:
            shap_vals = explainer.shap_values(scaled)
            vals = shap_vals[0] if isinstance(shap_vals, np.ndarray) and shap_vals.ndim >= 2 else shap_vals
            # Pair with features and sort by impact magnitude
            indexed = sorted(zip(features.FEATURES, vals), key=lambda x: abs(x[1]), reverse=True)
            shap_factors = [
                {"feature": str(k), "impact": round(float(v), 4)}
                for k, v in indexed[:3]
            ]
        except Exception as e:
            logger.debug(f"SHAP calculation skipped: {e}")

    feature_dict = dict(zip(features.FEATURES, [float(v) for v in vec]))

    resp = ClaimInferenceResponse(
        contract_version=CONTRACT_VERSION,
        model_version=MODEL_VERSION,
        correlation_id=req.correlation_id,
        claim_id=req.claim_id,
        fraud_probability=round(prob, 4),
        features=feature_dict,
        signals=signals,
        shap_top_factors=shap_factors,
    )

    # 6. Audit logging to MongoDB (best effort)
    try:
        col = get_mongo_collection()
        if col is not None:
            col.insert_one({
                "correlation_id": req.correlation_id,
                "claim_id": req.claim_id,
                "worker_id": req.worker_id,
                "tenant_id": req.tenant_id,
                "model_version": MODEL_VERSION,
                "contract_version": CONTRACT_VERSION,
                "fraud_probability": round(prob, 4),
                "features": feature_dict,
                "signals": signals,
                "shap_top_factors": shap_factors,
                "created_at": datetime.now(timezone.utc),
            })
    except Exception as mongo_err:
        logger.debug(f"MongoDB audit logging skipped: {mongo_err}")

    return resp


# ---------- Redis Pub/Sub Listener ----------
async def listen():
    """
    Subscribes to Redis channel 'ml:fraud:request' and publishes results to 'ml:fraud:result'.
    Runs continuously with automatic reconnection.
    """
    logger.info("Initializing Redis pub/sub listener...")
    while True:
        r = None
        try:
            r = aioredis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=1.0,
                socket_timeout=1.0,
            )
            pubsub = r.pubsub()
            await pubsub.subscribe("ml:fraud:request")
            logger.info("Successfully subscribed to Redis channel ml:fraud:request")

            async for msg in pubsub.listen():
                if not msg or msg.get("type") != "message":
                    continue
                data_str = msg.get("data")
                if not data_str:
                    continue

                try:
                    payload = json.loads(data_str)
                    req = ClaimInferenceRequest.model_validate(payload)

                    # Deduplication lock across multiple ML replicas (TTL 10s)
                    lock_key = f"ml:claimed:{req.correlation_id}"
                    claimed = await r.set(lock_key, "1", nx=True, ex=10)
                    if not claimed:
                        logger.debug(f"Request {req.correlation_id} already claimed by another replica")
                        continue

                    # Score and publish result
                    result = score(req)
                    await r.publish("ml:fraud:result", result.model_dump_json())
                    logger.info(f"Evaluated claim {req.claim_id}: prob={result.fraud_probability}")
                except Exception as inner_err:
                    logger.error(f"Failed to process inference request: {inner_err}", exc_info=True)

        except asyncio.CancelledError:
            logger.info("Redis listener task was cancelled")
            break
        except Exception as conn_err:
            logger.warning(f"Redis pub/sub disconnected ({conn_err}). Retrying in 2 seconds...")
            try:
                await asyncio.sleep(2)
            except asyncio.CancelledError:
                break
        finally:
            if r is not None:
                try:
                    await r.aclose()
                except Exception:
                    pass


# ---------- FastAPI App & Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load artifacts and start background pub/sub listener
    load_artifacts()
    listener_task = None
    if os.getenv("ENABLE_REDIS_LISTENER", "true").lower() != "false":
        listener_task = asyncio.create_task(listen())
    yield
    # Shutdown: Cleanly cancel background listener
    if listener_task is not None:
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass
    if mongo_client:
        mongo_client.close()
    logger.info("ML inference server shut down cleanly.")


app = FastAPI(
    title="Kavach ML / Fraud Detection Service",
    version=MODEL_VERSION,
    lifespan=lifespan,
)


@app.post("/infer", response_model=ClaimInferenceResponse)
async def infer(req: ClaimInferenceRequest):
    """
    Synchronous HTTP inference endpoint (Tier 2 fallback).
    """
    try:
        return score(req)
    except Exception as e:
        logger.error(f"Inference error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """
    Health check endpoint reporting service, model, and contract status.
    """
    model_loaded = model is not None and scaler is not None
    return {
        "status": "ok" if model_loaded else "degraded",
        "model_version": MODEL_VERSION,
        "contract_version": CONTRACT_VERSION,
        "model_loaded": model_loaded,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("inference_server:app", host="0.0.0.0", port=5000, reload=False)
