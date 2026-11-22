'use strict';

const client = require('prom-client');

// Collect default Node.js metrics (GC, event loop, memory, etc.)
client.collectDefaultMetrics({ prefix: 'kavach_' });

const metrics = {
  /* ── Claims ── */
  claimsTotal: new client.Counter({
    name: 'kavach_claims_total',
    help: 'Total number of claims filed',
    labelNames: ['tenant_id', 'coverage_type', 'decision'],
  }),

  claimLatency: new client.Histogram({
    name: 'kavach_claim_latency_seconds',
    help: 'Time from claim filed to final decision',
    labelNames: ['tenant_id', 'decision'],
    buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
  }),

  fraudFlagged: new client.Counter({
    name: 'kavach_fraud_flagged_total',
    help: 'Total number of claims flagged for potential fraud',
    labelNames: ['tenant_id', 'signal_type'],
  }),

  /* ── Payouts ── */
  payoutsTotal: new client.Counter({
    name: 'kavach_payouts_total',
    help: 'Total number of payouts processed',
    labelNames: ['tenant_id', 'status'],
  }),

  payoutAmountTotal: new client.Counter({
    name: 'kavach_payout_amount_total',
    help: 'Total payout amount in INR',
    labelNames: ['tenant_id'],
  }),

  /* ── Triggers ── */
  activeTriggers: new client.Gauge({
    name: 'kavach_active_triggers',
    help: 'Number of currently active trigger events',
    labelNames: ['tenant_id', 'coverage_type'],
  }),

  /* ── ML ── */
  mlInferenceMs: new client.Histogram({
    name: 'kavach_ml_inference_duration_ms',
    help: 'ML inference latency in milliseconds',
    labelNames: ['model_version'],
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2500],
  }),

  /* ── SSE ── */
  sseConnections: new client.Gauge({
    name: 'kavach_sse_connections',
    help: 'Current number of active SSE connections',
    labelNames: ['tenant_id'],
  }),

  /* ── Cache ── */
  cacheHits: new client.Counter({
    name: 'kavach_cache_hits_total',
    help: 'Total cache hits',
    labelNames: ['cache_key_prefix'],
  }),

  cacheMisses: new client.Counter({
    name: 'kavach_cache_misses_total',
    help: 'Total cache misses',
    labelNames: ['cache_key_prefix'],
  }),

  /* ── Locking ── */
  lockContention: new client.Counter({
    name: 'kavach_lock_contention_total',
    help: 'Total number of lock acquisition failures',
    labelNames: ['lock_key_prefix'],
  }),

  /* ── State Machine ── */
  illegalTransitions: new client.Counter({
    name: 'kavach_illegal_transitions_total',
    help: 'Total number of illegal state transition attempts',
    labelNames: ['tenant_id'],
  }),

  /* ── Queue Depth ── */
  queueDepth: new client.Gauge({
    name: 'kavach_queue_depth',
    help: 'Current number of waiting jobs per queue',
    labelNames: ['queue_name'],
  }),
};

module.exports = { metrics, register: client.register };
