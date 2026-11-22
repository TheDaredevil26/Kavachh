'use strict';

const crypto = require('crypto');
const { redis, redisSub } = require('../../config/redis');
const { mlBreaker } = require('../../utils/circuitBreaker');
const logger = require('../../utils/logger');

/**
 * Transforms raw claim context into the standardized, versioned 8-feature contract.
 *
 * @param {object} ctx - Unified claim evaluation context
 * @returns {object} Features object conforming to contract_version 1.0
 */
function toContract(ctx) {
  const worker = ctx.worker || {};
  const claim = ctx.claim || {};
  const trigger = ctx.trigger || {};
  const layers = ctx.layerResults || {};

  // 1. GPS Jitter Score
  const gpsJitter = layers.gps_physics?.details?.gps_jitter_score
    ?? layers.gps_physics?.details?.jitterMeters
    ?? 0.85;

  // 2. Velocity Plausible (1 = physically possible, 0 = teleported/spoofed)
  const velocityPlausible = layers.gps_physics?.details?.velocityPlausible !== false
    && !layers.gps_physics?.details?.impossibleVelocity ? 1 : 0;

  // 3. Pre-Trigger Active in Zone (1 = present before announcement, 0 = retroactive)
  const preTriggerActive = layers.temporal?.details?.pre_trigger_active ?? 1;

  // 4. Burst Flag (1 = in synchronized spike, 0 = normal traffic)
  const burstFlag = layers.burst?.details?.burst_flag ?? 0;

  // 5. Zone Claim Rate
  const zoneClaimRate = layers.zone_claim_rate?.details?.zone_claim_rate ?? 0.40;

  // 6. Delivery History Hours (hours since last platform order)
  const deliveryHistoryHours = layers.platform_activity?.details?.delivery_history_hours ?? 2.5;

  // 7. Registration Age Days
  let registrationAgeDays = 60;
  if (worker.createdAt) {
    const ageMs = Date.now() - new Date(worker.createdAt).getTime();
    registrationAgeDays = Math.max(0, Math.floor(ageMs / (24 * 3600 * 1000)));
  }

  // 8. Registration IP Cluster Count
  const registrationIpCluster = layers.network_graph?.details?.registration_ip_cluster
    ?? layers.network_graph?.details?.ipClusterSize
    ?? 1;

  return {
    gps_lat: claim.gpsLat ? Number(claim.gpsLat) : 28.6139,
    gps_lng: claim.gpsLng ? Number(claim.gpsLng) : 77.2090,
    gps_jitter_score: Number(gpsJitter),
    velocity_plausible: Number(velocityPlausible),
    pre_trigger_active: Number(preTriggerActive),
    burst_flag: Number(burstFlag),
    zone_claim_rate: Number(zoneClaimRate),
    delivery_history_hours: Number(deliveryHistoryHours),
    registration_age_days: Number(registrationAgeDays),
    registration_ip_cluster: Number(registrationIpCluster),
  };
}

/**
 * Client for communicating with the Python FastAPI ML microservice.
 * Multi-tiered resilience:
 * Tier 1: Redis Pub/Sub (sub 50ms latency, high throughput)
 * Tier 2: HTTP /infer with Circuit Breaker (Opossum, 3s timeout)
 * Tier 3: Conservative In-Process Rule-Based Scoring Fallback
 */
class MlClient {
  constructor(subClient, pubClient) {
    this.sub = subClient || redisSub;
    this.pub = pubClient || redis;
    this.pending = new Map();

    // Subscribe to ML response channel
    this.sub.subscribe('ml:fraud:result', (err) => {
      if (err) {
        logger.error('Failed to subscribe to ml:fraud:result', { error: err.message });
      } else {
        logger.info('Subscribed to ml:fraud:result for ML inference');
      }
    });

    this.sub.on('message', (channel, rawMessage) => {
      if (channel !== 'ml:fraud:result') return;

      try {
        const response = JSON.parse(rawMessage);
        const correlationId = response.correlation_id;
        if (correlationId && this.pending.has(correlationId)) {
          const resolveFn = this.pending.get(correlationId);
          resolveFn(response);
        }
      } catch (err) {
        logger.error('Failed to parse message on ml:fraud:result', { error: err.message });
      }
    });
  }

  /**
   * Evaluates fraud probability for a claim context.
   *
   * @param {object} ctx - Context containing claim, worker, policy, trigger, and layers
   * @returns {Promise<{
   *   model_version: string,
   *   contract_version: string,
   *   fraud_probability: number,
   *   confidence_score: number,
   *   features: object,
   *   shap_top_factors: Array
   * }>}
   */
  async score(ctx) {
    const correlationId = crypto.randomUUID();
    const claimId = ctx.claim?.id || ctx.claimId;
    const tenantId = ctx.tenantId || ctx.claim?.tenantId;
    const workerId = ctx.workerId || ctx.worker?.id;
    const triggerEventId = ctx.trigger?.id || ctx.claim?.triggerEventId;

    const features = toContract(ctx);

    const payload = {
      contract_version: '1.0',
      correlation_id: correlationId,
      claim_id: claimId,
      tenant_id: tenantId,
      worker_id: workerId,
      trigger_event_id: triggerEventId,
      ...features,
    };

    // Tier 1: Attempt Redis Pub/Sub with 3-second timeout
    const viaPubSub = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new Error('ML_PUBSUB_TIMEOUT'));
      }, 3000);

      this.pending.set(correlationId, (response) => {
        clearTimeout(timer);
        this.pending.delete(correlationId);
        resolve(response);
      });
    });

    try {
      await this.pub.publish('ml:fraud:request', JSON.stringify(payload));
      return await viaPubSub;
    } catch (pubSubErr) {
      logger.warn('Pub/Sub ML evaluation failed, falling back to HTTP circuit breaker', {
        error: pubSubErr.message,
        claimId,
      });

      // Tier 2 & 3: HTTP /infer via circuit breaker with rule-based fallback
      try {
        const result = await mlBreaker.fire(payload);
        return result;
      } catch (circuitErr) {
        logger.error('Circuit breaker execution failed, using direct rule-based fallback', {
          error: circuitErr.message,
          claimId,
        });
        const { ruleBasedFraudScore } = require('../../utils/circuitBreaker');
        return ruleBasedFraudScore(payload);
      }
    }
  }
}

const mlClient = new MlClient();

module.exports = mlClient;
module.exports.MlClient = MlClient;
module.exports.toContract = toContract;
