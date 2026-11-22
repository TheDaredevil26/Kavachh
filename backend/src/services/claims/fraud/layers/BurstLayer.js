'use strict';

const { FraudLayer } = require('../FraudLayer');
const { redis } = require('../../../../config/redis');

/**
 * Record a claim filing timestamp in Redis and check whether a burst is underway.
 * Uses a Redis sorted set with sliding window of 3 minutes.
 *
 * @param {string} zoneId
 * @param {string} triggerId
 * @param {string} claimId
 * @returns {Promise<boolean>} True if burst detected (> 50 claims in 3 mins)
 */
async function recordClaimAndCheckBurst(zoneId, triggerId, claimId) {
  const key = `burst:${triggerId}:${zoneId}`;
  const now = Date.now();
  const windowMs = 3 * 60 * 1000; // 3 minutes

  const pipeline = redis.pipeline();
  pipeline.zadd(key, now, claimId);
  pipeline.zremrangebyscore(key, 0, now - windowMs); // prune items older than 3 mins
  pipeline.zcard(key);                                // count remaining in window
  pipeline.expire(key, 600);                          // 10-minute TTL

  const results = await pipeline.exec();
  const count = results && results[2] && results[2][1] ? Number(results[2][1]) : 1;

  return count > 50;
}

/**
 * Layer C: Claim Burst Detection
 *
 * Checks if claim arrived as part of a synchronized spike (> 50 claims in < 3 minutes).
 * Genuine claims trickle in over hours; botnet/fraud syndicates submit in tight clusters.
 */
class BurstLayer extends FraudLayer {
  constructor() {
    super('burst');
  }

  /**
   * @param {object} ctx
   * @param {string} [ctx.zoneId]
   * @param {string} [ctx.triggerEventId]
   * @param {string} [ctx.claimId]
   */
  async evaluate(ctx) {
    const zoneId = ctx.zoneId || (ctx.worker && ctx.worker.zoneId) || (ctx.trigger && ctx.trigger.zoneId);
    const triggerId = ctx.triggerEventId || (ctx.claim && ctx.claim.triggerEventId) || (ctx.trigger && ctx.trigger.id);
    const claimId = ctx.claimId || (ctx.claim && ctx.claim.id);

    if (!zoneId || !triggerId || !claimId) {
      return this.result(false, 0.95, { burst_flag: 0, reason: 'Missing burst parameters' });
    }

    try {
      const isBurst = await recordClaimAndCheckBurst(zoneId, triggerId, claimId);

      const score = isBurst ? 0.25 : 0.95;
      return this.result(isBurst, score, {
        burst_flag: isBurst ? 1 : 0,
        isBurst,
        zoneId,
        triggerId,
      });
    } catch (_err) {
      return this.result(false, 0.9, { burst_flag: 0, error: 'Burst check degraded' });
    }
  }
}

BurstLayer.recordClaimAndCheckBurst = recordClaimAndCheckBurst;

module.exports = BurstLayer;
module.exports.recordClaimAndCheckBurst = recordClaimAndCheckBurst;
