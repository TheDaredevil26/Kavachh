'use strict';

const prisma = require('../../../db/prisma');
const { redis } = require('../../../config/redis');
const { cached } = require('../../../cache/cached');
const logger = require('../../../utils/logger');

/**
 * Freeze low-confidence claims in a compromised zone by setting hold status.
 * Honest workers with confidence >= 0.65 are untouched.
 *
 * @param {string} triggerEventId
 * @param {string} zoneId
 */
async function freezeZoneLowConfidenceClaims(triggerEventId, zoneId) {
  try {
    // Find claims for this trigger where worker belongs to this zone and confidence < 0.65
    const workersInZone = await prisma.worker.findMany({
      where: { zoneId },
      select: { id: true },
    });

    const workerIds = workersInZone.map((w) => w.id);
    if (workerIds.length === 0) return;

    // Flag candidate claims that are not yet paid
    const updated = await prisma.claim.updateMany({
      where: {
        triggerEventId,
        workerId: { in: workerIds },
        status: { in: ['filed', 'validated', 'scoring', 'decided'] },
        OR: [
          { confidenceScore: { lt: 0.65 } },
          { confidenceScore: null },
        ],
      },
      data: {
        isFlaggedForReview: true,
        holdReason: `Zone participation anomaly (${zoneId}) — syndication review`,
      },
    });

    logger.warn('Freezing low-confidence claims due to zone fraud ring flag', {
      zoneId,
      triggerEventId,
      count: updated.count,
    });
  } catch (err) {
    logger.error('Failed to freeze zone low-confidence claims', {
      zoneId,
      triggerEventId,
      error: err.message,
    });
  }
}

/**
 * Evaluates whether a zone has exceeded the statistical participation ceiling (>70%).
 * If detected, sets a 1-hour ring flag in Redis, publishes an alert event,
 * and holds low-confidence claims in that zone.
 *
 * @param {string} triggerEventId - Trigger event UUID
 * @param {string} zoneId         - Zone identifier
 * @returns {Promise<{ ringDetected: boolean, zoneRate: number, totalClaims: number, totalWorkers: number }>}
 */
async function detectZoneFraudRing(triggerEventId, zoneId) {
  if (!triggerEventId || !zoneId) {
    return { ringDetected: false, zoneRate: 0, totalClaims: 0, totalWorkers: 0 };
  }

  try {
    const [totalWorkers, totalClaims] = await Promise.all([
      cached(`zone:workers:${zoneId}`, 300, async () => {
        return prisma.worker.count({
          where: { zoneId, status: 'active' },
        });
      }),
      prisma.claim.count({
        where: { triggerEventId },
      }),
    ]);

    const effectiveWorkers = Math.max(totalWorkers, 1);
    const zoneRate = Math.round((totalClaims / effectiveWorkers) * 1000) / 1000;

    const ringDetected = zoneRate > 0.70;

    if (ringDetected) {
      logger.warn('Fraud ring signature detected in zone', {
        zoneId,
        triggerEventId,
        zoneRate,
        totalClaims,
        totalWorkers: effectiveWorkers,
      });

      // Set 1-hour freeze flag in Redis
      await redis.set(`zone:fraud_ring:${zoneId}`, '1', 'EX', 3600);

      // Freeze all low-confidence claims
      await freezeZoneLowConfidenceClaims(triggerEventId, zoneId);

      // Publish notification for fraud analysts / monitoring
      await redis.publish(
        'evt:fraud.ring_suspected',
        JSON.stringify({
          zoneId,
          triggerEventId,
          zoneRate,
          totalClaims,
          totalWorkers: effectiveWorkers,
          detectedAt: new Date().toISOString(),
        })
      );
    }

    return {
      ringDetected,
      zoneRate,
      totalClaims,
      totalWorkers: effectiveWorkers,
    };
  } catch (err) {
    logger.error('Error in detectZoneFraudRing', { error: err.message, zoneId, triggerEventId });
    return { ringDetected: false, zoneRate: 0, totalClaims: 0, totalWorkers: 0 };
  }
}

module.exports = {
  detectZoneFraudRing,
  freezeZoneLowConfidenceClaims,
};
