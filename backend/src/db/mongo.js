'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../utils/logger');

/* ────────────────────── Connection ────────────────────── */

const mongoConnection = mongoose.createConnection(env.MONGO_URL, {
  autoIndex: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
});

mongoConnection.on('connected', () => logger.info('MongoDB connected'));
mongoConnection.on('error', (err) => logger.error('MongoDB error', { error: err.message }));
mongoConnection.on('disconnected', () => logger.warn('MongoDB disconnected'));

/* ────────────────────── Schemas ───────────────────────── */

// GPS Ping — high-volume telemetry from worker apps
const gpsPingSchema = new mongoose.Schema(
  {
    worker_id: { type: String, required: true, index: true },
    tenant_id: { type: String, required: true, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    accuracy_m: { type: Number },
    speed_kmh: { type: Number },
    heading: { type: Number },
    battery_pct: { type: Number },
    recorded_at: { type: Date, required: true },
    received_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
gpsPingSchema.index({ location: '2dsphere' });
gpsPingSchema.index({ recorded_at: 1 }, { expireAfterSeconds: 90 * 86400 }); // 90-day TTL

// Activity Event — app-level events (order_accepted, delivered, etc.)
const activityEventSchema = new mongoose.Schema(
  {
    worker_id: { type: String, required: true, index: true },
    tenant_id: { type: String, required: true, index: true },
    event_type: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    source: { type: String, enum: ['app', 'platform_webhook', 'manual'], default: 'app' },
    recorded_at: { type: Date, required: true },
    received_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
activityEventSchema.index({ recorded_at: 1 }, { expireAfterSeconds: 180 * 86400 }); // 180-day TTL

// Dark Store Check-in — QR-based proof of presence
const darkStoreCheckinSchema = new mongoose.Schema(
  {
    worker_id: { type: String, required: true, index: true },
    tenant_id: { type: String, required: true, index: true },
    dark_store_id: { type: String, required: true, index: true },
    nonce: { type: String, required: true },
    qr_payload: { type: String, required: true },
    gps_lat: { type: Number, required: true },
    gps_lng: { type: Number, required: true },
    distance_to_store_m: { type: Number },
    verified: { type: Boolean, default: false },
    checked_in_at: { type: Date, required: true },
    received_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
darkStoreCheckinSchema.index({ nonce: 1 }, { unique: true });
darkStoreCheckinSchema.index({ checked_in_at: 1 }, { expireAfterSeconds: 365 * 86400 }); // 1-year TTL

// ML Prediction Log — every inference call logged for audit and retraining
const mlPredictionLogSchema = new mongoose.Schema(
  {
    claim_id: { type: String, required: true, index: true },
    worker_id: { type: String, required: true, index: true },
    tenant_id: { type: String, required: true, index: true },
    model_version: { type: String, required: true },
    features: { type: mongoose.Schema.Types.Mixed, required: true },
    fraud_probability: { type: Number, required: true },
    confidence_score: { type: Number },
    decision: { type: String, enum: ['auto_approve', 'partial', 'hold'], index: true },
    latency_ms: { type: Number },
    predicted_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
mlPredictionLogSchema.index({ predicted_at: 1 }, { expireAfterSeconds: 730 * 86400 }); // 2-year TTL

// Provider Payload — raw webhook payloads from platform partners
const providerPayloadSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    event_type: { type: String, required: true, index: true },
    raw_payload: { type: mongoose.Schema.Types.Mixed, required: true },
    headers: { type: mongoose.Schema.Types.Mixed },
    idempotency_key: { type: String, index: true },
    processed: { type: Boolean, default: false },
    processed_at: { type: Date },
    received_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
providerPayloadSchema.index({ received_at: 1 }, { expireAfterSeconds: 365 * 86400 }); // 1-year TTL

// Audit Event — immutable compliance and security audit log
const auditEventSchema = new mongoose.Schema(
  {
    actor_type: { type: String, enum: ['worker', 'admin', 'system', 'cron'], required: true },
    actor_id: { type: String, required: true, index: true },
    tenant_id: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    resource_type: { type: String, required: true },
    resource_id: { type: String, required: true },
    changes: { type: mongoose.Schema.Types.Mixed },
    ip_address: { type: String },
    user_agent: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    occurred_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
auditEventSchema.index({ occurred_at: 1 }, { expireAfterSeconds: 2 * 365 * 86400 }); // 2-year TTL

/* ────────────────────── Models ────────────────────────── */

const GpsPing = mongoConnection.model('GpsPing', gpsPingSchema);
const ActivityEvent = mongoConnection.model('ActivityEvent', activityEventSchema);
const DarkStoreCheckin = mongoConnection.model('DarkStoreCheckin', darkStoreCheckinSchema);
const MlPredictionLog = mongoConnection.model('MlPredictionLog', mlPredictionLogSchema);
const ProviderPayload = mongoConnection.model('ProviderPayload', providerPayloadSchema);
const AuditEvent = mongoConnection.model('AuditEvent', auditEventSchema);

module.exports = {
  mongoConnection,
  GpsPing,
  ActivityEvent,
  DarkStoreCheckin,
  MlPredictionLog,
  ProviderPayload,
  AuditEvent,
};
