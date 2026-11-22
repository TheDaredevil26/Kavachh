'use strict';

const prisma = require('../../db/prisma');
const { reviewPriority } = require('./decisionEngine');

/**
 * Fetch manual review queue for claims in 'held' status.
 * Ordered strictly by review_priority DESC, followed by created_at ASC.
 *
 * @param {string} [tenantId] - Optional tenant filter
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @returns {Promise<{ claims: Array, total: number }>}
 */
async function getReviewQueue(tenantId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 50));
  const offset = Math.max(0, Number(options.offset) || 0);

  const where = {
    status: 'held',
  };

  if (tenantId) {
    where.tenantId = tenantId;
  }

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      orderBy: [
        { reviewPriority: 'desc' },
        { createdAt: 'asc' },
      ],
      skip: offset,
      take: limit,
      include: {
        worker: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            zoneId: true,
            currentCity: true,
            status: true,
            registrationIpAddress: true,
          },
        },
        policy: {
          select: {
            id: true,
            tier: true,
            maxPayoutPerEvent: true,
            coverageCeiling: true,
            reservedAmount: true,
            settledAmount: true,
            startDate: true,
            endDate: true,
          },
        },
        triggerEvent: {
          select: {
            id: true,
            triggerType: true,
            zoneId: true,
            severity: true,
            detectedAt: true,
            announcedAt: true,
            status: true,
          },
        },
        fraudSignals: {
          select: {
            id: true,
            signalType: true,
            isSuspicious: true,
            score: true,
            details: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.claim.count({ where }),
  ]);

  return {
    claims,
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
  };
}

module.exports = {
  reviewPriority,
  getReviewQueue,
};
