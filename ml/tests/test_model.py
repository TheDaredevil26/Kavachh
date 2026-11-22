"""
Unit and integration tests for Kavach ML / Fraud Detection Service.
Tests fraud probability thresholds for genuine claims (< 0.30) and fraud rings (> 0.80).
"""

import os
import sys

# Disable redis background listener in tests when testing HTTP endpoints
os.environ["ENABLE_REDIS_LISTENER"] = "false"

import pytest
from fastapi.testclient import TestClient

# Ensure ml package is on PYTHONPATH
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import features
from inference_server import (
    app,
    score,
    load_artifacts,
    ClaimInferenceRequest,
    ClaimInferenceResponse,
)


@pytest.fixture(scope="session", autouse=True)
def setup_artifacts():
    """Ensure artifacts are loaded before running test cases."""
    load_artifacts()


@pytest.fixture
def genuine_request() -> ClaimInferenceRequest:
    """Fixture for a typical genuine gig-worker claim."""
    return ClaimInferenceRequest(
        correlation_id="test-corr-genuine-1",
        claim_id="claim-genuine-001",
        tenant_id="zepto",
        worker_id="worker-genuine-42",
        trigger_event_id="trigger-rain-delhi-01",
        gps_lat=28.6139,
        gps_lng=77.2090,
        gps_jitter_score=0.85,
        velocity_plausible=1.0,
        pre_trigger_active=1.0,
        delivery_history_hours=1.5,
        registration_age_days=180.0,
        registration_ip_cluster=1.0,
        zone_claim_rate=0.35,
        burst_flag=0.0,
    )


@pytest.fixture
def fraud_request() -> ClaimInferenceRequest:
    """Fixture for a syndicated fraud-ring claim."""
    return ClaimInferenceRequest(
        correlation_id="test-corr-fraud-1",
        claim_id="claim-fraud-999",
        tenant_id="blinkit",
        worker_id="worker-fraud-farm-01",
        trigger_event_id="trigger-rain-delhi-01",
        gps_lat=28.6139,
        gps_lng=77.2090,
        gps_jitter_score=0.015,
        velocity_plausible=0.0,
        pre_trigger_active=0.0,
        delivery_history_hours=96.0,
        registration_age_days=2.0,
        registration_ip_cluster=35.0,
        zone_claim_rate=0.92,
        burst_flag=1.0,
    )


def test_features_extract(genuine_request):
    """Test feature vector extraction contract and ordering."""
    vec = features.extract(genuine_request)
    assert len(vec) == 8
    assert len(vec) == len(features.FEATURES)
    assert vec[0] == 0.85  # gps_jitter_score
    assert vec[1] == 1.0   # velocity_plausible
    assert vec[2] == 1.0   # pre_trigger_active
    assert vec[7] == 0.0   # burst_flag


def test_signals_generation(genuine_request, fraud_request):
    """Test per-layer signals extraction."""
    genuine_vec = features.extract(genuine_request)
    genuine_signals = features.extract_signals(genuine_request, genuine_vec)
    assert len(genuine_signals) == 6
    assert all(not s["suspicious"] for s in genuine_signals)

    fraud_vec = features.extract(fraud_request)
    fraud_signals = features.extract_signals(fraud_request, fraud_vec)
    assert len(fraud_signals) == 6
    assert any(s["suspicious"] for s in fraud_signals)


def test_genuine_claim_probability(genuine_request):
    """
    Core Requirement: Genuine claim must score < 0.30 fraud probability.
    """
    res = score(genuine_request)
    assert isinstance(res, ClaimInferenceResponse)
    assert res.fraud_probability < 0.30, f"Expected < 0.30, got {res.fraud_probability}"
    assert len(res.signals) == 6
    assert len(res.features) == 8


def test_fraud_ring_claim_probability(fraud_request):
    """
    Core Requirement: Fraud claim must score > 0.80 fraud probability.
    """
    res = score(fraud_request)
    assert isinstance(res, ClaimInferenceResponse)
    assert res.fraud_probability > 0.80, f"Expected > 0.80, got {res.fraud_probability}"
    assert len(res.signals) == 6
    assert len(res.features) == 8


def test_api_health():
    """Test GET /health endpoint."""
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["model_version"] == "v1"
        assert data["contract_version"] == "1.0"
        assert data["model_loaded"] is True


def test_api_infer_endpoint(genuine_request, fraud_request):
    """Test POST /infer endpoint with both genuine and fraud requests."""
    with TestClient(app) as client:
        # 1. Genuine request
        resp_gen = client.post("/infer", json=genuine_request.model_dump())
        assert resp_gen.status_code == 200
        gen_data = resp_gen.json()
        assert gen_data["fraud_probability"] < 0.30
        assert gen_data["claim_id"] == genuine_request.claim_id

        # 2. Fraud request
        resp_fraud = client.post("/infer", json=fraud_request.model_dump())
        assert resp_fraud.status_code == 200
        fraud_data = resp_fraud.json()
        assert fraud_data["fraud_probability"] > 0.80
        assert fraud_data["claim_id"] == fraud_request.claim_id
