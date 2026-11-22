'use strict';

const { FraudLayer } = require('../FraudLayer');
const prisma = require('../../../../db/prisma');
const { cached } = require('../../../../cache/cached');

/**
 * Layer D: Zone Claim Rate Anomaly
 *
 * Compares total claims filed for this trigger event against total registered
 * workers in the same zone.
 * - Genuine participation rate: 35%–55%
 * - Anomaly threshold: > 70% suggests coordinated ring behavior
 */
class ZoneRateLayer extends FraudLayer {
  constructor() {
    super('zone_claim_rate');
  }

  /**
   * @param {object} ctx
   * @param {string} ctx.triggerEventId
   * @param {string} ctx.zoneId
   */
  async evaluate(ctx) {
    const triggerEventId = ctx.triggerEventId || (ctx.claim && ctx.claim.triggerEventId);
    const zoneId = ctx.zoneId || (ctx.worker && ctx.worker.zoneId) || (ctx.trigger && ctx.trigger.zoneId);

    if (!triggerEventId || !zoneId) {
      return this.result(false, 0.9, { zone_claim_rate: 0.45, reason: 'Missing trigger or zone id' });
    }

    try {
      // 1. Worker count in zone (cached for 5 minutes)
      const totalWorkers = await cached(`zone:workers:${zoneId}`, 300, async () => {
        return prisma.worker.count({
          where: { zoneId, status: 'active' },
        });
      });

      // 2. Total claims filed for this trigger event
      const totalClaims = await prisma.claim.count({
        where: { triggerEventId },
      });

      const effectiveWorkers = Math.max(totalWorkers, 1);
      const zoneRate = Math.round((totalClaims / effectiveWorkers) * 1000) / 1000;

      const isSuspicious = zoneRate > 0.70;
      let score = 0.95;
      if (zoneRate > 0.85) {
        score = 0.15;
      } else if (zoneRate > 0.70) {
        score = 0.35;
      }

      return this.result(isSuspicious, score, {
        zone_claim_rate: zoneRate,
        totalClaims,
        totalWorkers: effectiveWorkers,
        anomalyThreshold: 0.70,
      });
    } catch (_err) {
      return this.result(false, 0.85, { zone_claim_rate: 0.45, error: 'Zone rate check degraded' });
    }
  }
}

module.exports = ZoneRateLayer;
