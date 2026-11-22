'use strict';

const prisma = require('../../db/prisma');
const { forTenant } = require('../../db/tenantClient');
const { redis } = require('../../config/redis');
const queues = require('../../config/queues');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const { ClaimStateMachine } = require('./stateMachine');
const { reviewPriority } = require('./decisionEngine');

const stateMachine = new ClaimStateMachine(prisma, redis);

/**
 * Determine if an error is a Prisma unique constraint violation (P2002).
 *
 * @param {Error} err
 * @returns {boolean}
 */
function isUniqueViolation(err) {
  return err && err.code === 'P2002';
}

/**
 * File a parametric insurance claim.
 *
 * Concurrency-safe & idempotent:
 * - Layer 1: Redis SET NX 30s guard against double-clicks/client retries.
 * - Layer 2: PostgreSQL unique constraint on idempotency_key (worker_id:trigger_event_id).
 *
 * Requirements:
 * - Worker must be active.
 * - Policy must be active and valid today.
 * - 72-hour waiting period from policy creation must have elapsed.
 * - Trigger event must be announced and match worker's assigned zone.
 *
 * @param {string} tenantId       - Tenant UUID
 * @param {string} workerId       - Authenticated worker UUID
 * @param {string} triggerEventId - Trigger event UUID
 * @param {string} policyId       - Policy UUID
 * @param {object} [gps]          - Optional GPS payload { lat, lng }
 * @returns {Promise<object>} Created or existing claim record
 */
async function fileClaim(tenantId, workerId, triggerEventId, policyId, gps = null) {
  const db = forTenant(tenantId);

  // 1. Worker verification
  const worker = await db.worker.findFirst({
    where: { id: workerId, status: 'active' },
  });

  if (!worker) {
    throw new AppError('WORKER_NOT_FOUND', 404, 'Active worker profile not found');
  }

  // 2. Policy verification
  const now = new Date();
  const policy = await db.policy.findFirst({
    where: {
      id: policyId,
      workerId,
      isActive: true,
      status: 'active',
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });

  if (!policy) {
    throw new AppError('NO_ACTIVE_POLICY', 400, 'No active policy found for worker covering the current period');
  }

  // 3. 72-Hour Waiting Period Verification
  const policyCreatedAt = new Date(policy.createdAt).getTime();
  const waitingPeriodEndsAt = policyCreatedAt + 72 * 3600 * 1000;
  if (now.getTime() < waitingPeriodEndsAt) {
    const hoursRemaining = Math.ceil((waitingPeriodEndsAt - now.getTime()) / (3600 * 1000));
    throw new AppError(
      'WAITING_PERIOD_ACTIVE',
      400,
      `Policy 72-hour waiting period is active. ${hoursRemaining} hours remaining.`
    );
  }

  // 4. Trigger event verification in worker's zone
  const trigger = await prisma.triggerEvent.findFirst({
    where: {
      id: triggerEventId,
      zoneId: worker.zoneId,
      status: { not: 'cancelled' },
    },
  });

  if (!trigger) {
    throw new AppError(
      'NO_ACTIVE_TRIGGER',
      400,
      `Trigger event does not exist or is not associated with worker zone "${worker.zoneId}"`
    );
  }

  if (!trigger.announcedAt) {
    throw new AppError(
      'TRIGGER_NOT_ANNOUNCED',
      400,
      'Trigger event is still in the silent observation window and has not been publicly announced'
    );
  }

  const idempotencyKey = `${workerId}:${triggerEventId}`;

  // 5. Layer 1: Redis SET NX guard
  const redisGuardKey = `claim:filing:${idempotencyKey}`;
  const acquired = await redis.set(redisGuardKey, '1', 'EX', 30, 'NX');
  if (!acquired) {
    const existing = await db.claim.findUnique({
      where: { idempotencyKey },
      include: {
        policy: { select: { tier: true, maxPayoutPerEvent: true } },
        triggerEvent: { select: { triggerType: true, zoneId: true, severity: true } },
      },
    });
    if (existing) {
      logger.info('Claim returned from Redis NX deduplication', { idempotencyKey, claimId: existing.id });
      return existing;
    }
  }

  // 6. Layer 2: Insert into Database with unique constraint guarantee
  try {
    const claim = await db.claim.create({
      data: {
        tenantId,
        workerId,
        policyId,
        triggerEventId,
        idempotencyKey,
        status: 'filed',
        requestedAmount: policy.maxPayoutPerEvent,
      },
      include: {
        policy: { select: { tier: true, maxPayoutPerEvent: true } },
        triggerEvent: { select: { triggerType: true, zoneId: true, severity: true } },
      },
    });

    // Record initial transition
    await prisma.claimStateTransition.create({
      data: {
        claimId: claim.id,
        fromState: null,
        toState: 'filed',
        actor: `worker:${workerId}`,
        reason: 'Claim filed by worker against announced trigger',
        metadata: {
          gps: gps || null,
          requestedAmount: Number(policy.maxPayoutPerEvent),
        },
      },
    });

    // Enqueue BullMQ claim-validate job
    const validateQueue = queues['claim-validate'];
    if (validateQueue) {
      await validateQueue.add(
        'validate',
        { claimId: claim.id, tenantId, gps },
        { jobId: `validate:${claim.id}` }
      );
    } else {
      logger.warn('claim-validate BullMQ queue not configured');
    }

    logger.info('Claim filed successfully', {
      claimId: claim.id,
      workerId,
      triggerEventId,
      tenantId,
    });

    return claim;
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.info('Duplicate claim filing caught by database unique constraint', { idempotencyKey });
      return db.claim.findUniqueOrThrow({
        where: { idempotencyKey },
        include: {
          policy: { select: { tier: true, maxPayoutPerEvent: true } },
          triggerEvent: { select: { triggerType: true, zoneId: true, severity: true } },
        },
      });
    }
    throw err;
  }
}

/**
 * List claims for a worker (tenant-scoped).
 *
 * @param {string} tenantId
 * @param {string} workerId
 * @param {object} [options]
 * @returns {Promise<{ claims: Array, total: number }>}
 */
async function listWorkerClaims(tenantId, workerId, options = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 20));
  const offset = Math.max(0, Number(options.offset) || 0);

  const where = {
    tenantId,
    workerId,
  };

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        policy: { select: { tier: true, maxPayoutPerEvent: true } },
        triggerEvent: { select: { triggerType: true, zoneId: true, severity: true, detectedAt: true } },
        payout: { select: { status: true, amount: true, bankReferenceNumber: true, completedAt: true } },
      },
    }),
    prisma.claim.count({ where }),
  ]);

  // Strip internal fraud scores from worker view
  const sanitized = claims.map((c) => ({
    id: c.id,
    claim_id: c.id,
    tenant_id: c.tenantId,
    policy_id: c.policyId,
    trigger_event_id: c.triggerEventId,
    status: c.status,
    requested_amount: Number(c.requestedAmount || 0),
    approved_amount: c.approvedAmount ? Number(c.approvedAmount) : null,
    payout_amount: c.payoutAmount ? Number(c.payoutAmount) : null,
    payout_status: c.payoutStatus,
    dispute_window_ends_at: c.disputeWindowEndsAt,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    policy: c.policy,
    trigger_event: c.triggerEvent,
    payout: c.payout,
  }));

  return { claims: sanitized, total, page: Math.floor(offset / limit) + 1, limit };
}

/**
 * Get claim detail with timeline.
 * Hides fraud scores from workers, exposes them to admin users.
 *
 * @param {string} tenantId
 * @param {string} claimId
 * @param {boolean} isAdmin
 * @param {string} [workerId]
 * @returns {Promise<object>}
 */
async function getClaimById(tenantId, claimId, isAdmin = false, workerId = null) {
  const where = { id: claimId };
  if (!isAdmin && workerId) {
    where.workerId = workerId;
  }
  if (tenantId) {
    where.tenantId = tenantId;
  }

  const claim = await prisma.claim.findFirst({
    where,
    include: {
      worker: { select: { id: true, name: true, phoneNumber: true, zoneId: true, status: true } },
      policy: { select: { id: true, tier: true, maxPayoutPerEvent: true, coverageCeiling: true } },
      triggerEvent: { select: { id: true, triggerType: true, zoneId: true, severity: true, detectedAt: true, announcedAt: true } },
      payout: true,
      transitions: { orderBy: { createdAt: 'asc' } },
      fraudSignals: isAdmin,
      disputes: true,
    },
  });

  if (!claim) {
    throw new AppError('CLAIM_NOT_FOUND', 404, `Claim "${claimId}" not found`);
  }

  if (isAdmin) {
    return claim;
  }

  // Redact fraud scores for workers
  const {
    fraudProbability: _fp,
    confidenceScore: _cs,
    isFlaggedForReview: _fr,
    reviewPriority: _rp,
    holdReason: _hr,
    fraudSignals: _fs,
    ...safeClaim
  } = claim;

  return safeClaim;
}

/**
 * Lightweight claim status check.
 *
 * @param {string} tenantId
 * @param {string} claimId
 * @param {string} [workerId]
 * @returns {Promise<object>}
 */
async function getClaimStatus(tenantId, claimId, workerId = null) {
  const where = { id: claimId };
  if (workerId) {
    where.workerId = workerId;
  }
  if (tenantId) {
    where.tenantId = tenantId;
  }

  const claim = await prisma.claim.findFirst({
    where,
    select: {
      id: true,
      status: true,
      payoutStatus: true,
      payoutAmount: true,
      disputeWindowEndsAt: true,
      closedAt: true,
      updatedAt: true,
    },
  });

  if (!claim) {
    throw new AppError('CLAIM_NOT_FOUND', 404, `Claim "${claimId}" not found`);
  }

  return {
    id: claim.id,
    claim_id: claim.id,
    status: claim.status,
    payout_status: claim.payoutStatus,
    payout_amount: claim.payoutAmount ? Number(claim.payoutAmount) : null,
    dispute_window_ends_at: claim.disputeWindowEndsAt,
    closed_at: claim.closedAt,
    updated_at: claim.updatedAt,
  };
}

/**
 * Worker files a dispute against a paid claim during the 2-hour window.
 *
 * @param {string} tenantId
 * @param {string} workerId
 * @param {string} claimId
 * @param {string} reason
 * @returns {Promise<object>}
 */
async function disputeClaim(tenantId, workerId, claimId, reason) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, workerId, tenantId },
  });

  if (!claim) {
    throw new AppError('CLAIM_NOT_FOUND', 404, `Claim "${claimId}" not found`);
  }

  if (claim.status !== 'paid') {
    throw new AppError(
      'CLAIM_NOT_DISPUTABLE',
      400,
      `Only paid claims can be disputed. Current status: "${claim.status}"`
    );
  }

  const now = new Date();
  if (!claim.disputeWindowEndsAt || now > new Date(claim.disputeWindowEndsAt)) {
    throw new AppError(
      'DISPUTE_WINDOW_EXPIRED',
      400,
      'The 2-hour dispute window for this payout has expired'
    );
  }

  // Create dispute record and transition claim to 'disputed'
  const dispute = await prisma.claimDispute.create({
    data: {
      claimId,
      workerId,
      reason,
      status: 'open',
    },
  });

  await stateMachine.transition(claimId, 'disputed', `worker:${workerId}`, {
    reason,
    patch: { isFlaggedForReview: true },
  });

  logger.info('Claim disputed by worker', { claimId, workerId, disputeId: dispute.id });

  return dispute;
}

/**
 * Admin manual review of a held claim.
 *
 * @param {string} tenantId
 * @param {string} claimId
 * @param {string} adminId
 * @param {object} params
 * @param {string} params.decision - 'approve' | 'reject' | 'partial'
 * @param {string} [params.review_notes]
 * @param {number} [params.payout_percentage=100]
 * @returns {Promise<object>}
 */
async function reviewClaim(tenantId, claimId, adminId, { decision, review_notes, payout_percentage = 100 }) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, tenantId },
    include: { policy: true },
  });

  if (!claim) {
    throw new AppError('CLAIM_NOT_FOUND', 404, `Claim "${claimId}" not found`);
  }

  if (claim.status !== 'held') {
    throw new AppError('ILLEGAL_STATE', 400, `Claim is in "${claim.status}" status, not held for review`);
  }

  const policy = claim.policy;

  if (decision === 'approve' || decision === 'partial') {
    const pct = decision === 'approve' ? 100 : Number(payout_percentage) || 60;
    const payoutAmount = Math.round((Number(policy.maxPayoutPerEvent) * pct) / 100);

    // Re-reserve payout amount under row lock
    await prisma.$transaction(async (tx) => {
      await tx.policy.update({
        where: { id: policy.id },
        data: { reservedAmount: { increment: payoutAmount } },
      });

      await stateMachine.transition(claimId, 'payout_pending', `admin:${adminId}`, {
        tx,
        reason: review_notes || `Admin approved (${pct}%)`,
        patch: {
          approvedAmount: policy.maxPayoutPerEvent,
          payoutAmount,
          payoutPercentage: pct,
          reviewedBy: adminId,
          reviewNotes: review_notes || null,
          reviewedAt: new Date(),
          isFlaggedForReview: false,
        },
      });
    });

    // Enqueue payout BullMQ job
    const payoutQueue = queues['payout'];
    if (payoutQueue) {
      await payoutQueue.add('pay', { claimId }, { jobId: `pay:${claimId}` });
    }

    return { claimId, status: 'payout_pending', decision, payoutAmount };
  }

  if (decision === 'reject') {
    await stateMachine.transition(claimId, 'rejected', `admin:${adminId}`, {
      reason: review_notes || 'Admin rejected claim',
      patch: {
        reviewedBy: adminId,
        reviewNotes: review_notes || null,
        reviewedAt: new Date(),
        isFlaggedForReview: false,
      },
    });

    return { claimId, status: 'rejected', decision };
  }

  throw new AppError('INVALID_DECISION', 400, `Invalid review decision "${decision}"`);
}

/**
 * Admin resolves an open claim dispute.
 *
 * @param {string} tenantId
 * @param {string} disputeId
 * @param {string} adminId
 * @param {object} params
 * @param {string} params.decision - 'uphold' | 'reject'
 * @param {string} [params.resolution_notes]
 * @param {number} [params.adjustment_amount]
 * @returns {Promise<object>}
 */
async function resolveDispute(tenantId, disputeId, adminId, { decision, resolution_notes, adjustment_amount = 0 }) {
  const dispute = await prisma.claimDispute.findFirst({
    where: { id: disputeId },
    include: {
      claim: { include: { policy: true } },
    },
  });

  if (!dispute) {
    throw new AppError('DISPUTE_NOT_FOUND', 404, `Dispute "${disputeId}" not found`);
  }

  const claim = dispute.claim;
  if (tenantId && claim.tenantId !== tenantId) {
    throw new AppError('FORBIDDEN', 403, 'Dispute belongs to another tenant');
  }

  if (decision === 'uphold') {
    const adjAmount = Number(adjustment_amount) || 0;

    await prisma.$transaction(async (tx) => {
      // Update dispute record
      await tx.claimDispute.update({
        where: { id: disputeId },
        data: {
          status: 'upheld',
          resolutionNotes: resolution_notes || null,
          resolvedBy: adminId,
          resolvedAt: new Date(),
        },
      });

      if (adjAmount > 0) {
        // Reserve extra adjustment amount on policy
        await tx.policy.update({
          where: { id: claim.policyId },
          data: { reservedAmount: { increment: adjAmount } },
        });

        // Transition back to payout_pending for adjustment payout
        await stateMachine.transition(claim.id, 'payout_pending', `admin:${adminId}`, {
          tx,
          reason: `Dispute upheld with adjustment: ${resolution_notes || ''}`,
          patch: {
            payoutAmount: adjAmount,
            payoutStatus: 'initiated',
          },
        });
      } else {
        // Close if no further payout needed
        await stateMachine.transition(claim.id, 'closed', `admin:${adminId}`, {
          tx,
          reason: `Dispute upheld: ${resolution_notes || ''}`,
          patch: { closedAt: new Date() },
        });
      }
    });

    if (adjAmount > 0 && queues['payout']) {
      await queues['payout'].add('pay', { claimId: claim.id }, { jobId: `pay:${claim.id}:adj` });
    }

    return { disputeId, claimId: claim.id, decision: 'upheld', status: 'resolved' };
  }

  if (decision === 'reject') {
    await prisma.$transaction(async (tx) => {
      await tx.claimDispute.update({
        where: { id: disputeId },
        data: {
          status: 'rejected',
          resolutionNotes: resolution_notes || null,
          resolvedBy: adminId,
          resolvedAt: new Date(),
        },
      });

      // Dispute rejected -> transition claim to terminal closed
      await stateMachine.transition(claim.id, 'closed', `admin:${adminId}`, {
        tx,
        reason: `Dispute rejected: ${resolution_notes || ''}`,
        patch: { closedAt: new Date() },
      });
    });

    return { disputeId, claimId: claim.id, decision: 'rejected', status: 'closed' };
  }

  throw new AppError('INVALID_DECISION', 400, `Invalid dispute resolution decision "${decision}"`);
}

/**
 * Tenant-scoped analytics for admin dashboard.
 *
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
async function getTenantAnalytics(tenantId) {
  const where = tenantId ? { tenantId } : {};

  const [
    totalClaims,
    paidClaims,
    heldClaims,
    rejectedClaims,
    payoutStats,
    flaggedClaims,
    byTrigger,
  ] = await Promise.all([
    prisma.claim.count({ where }),
    prisma.claim.count({ where: { ...where, status: 'paid' } }),
    prisma.claim.count({ where: { ...where, status: 'held' } }),
    prisma.claim.count({ where: { ...where, status: 'rejected' } }),
    prisma.payout.aggregate({
      where: { ...where, status: 'completed' },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.claim.count({ where: { ...where, isFlaggedForReview: true } }),
    prisma.claim.groupBy({
      by: ['triggerEventId'],
      where,
      _count: { id: true },
    }),
  ]);

  const totalDisbursed = payoutStats._sum.amount ? Number(payoutStats._sum.amount) : 0;
  const fraudRate = totalClaims > 0 ? Math.round((flaggedClaims / totalClaims) * 1000) / 10 : 0;

  return {
    tenant_id: tenantId,
    total_claims: totalClaims,
    paid_claims: paidClaims,
    held_claims: heldClaims,
    rejected_claims: rejectedClaims,
    total_payouts_count: payoutStats._count.id,
    total_disbursed_inr: totalDisbursed,
    fraud_flagged_count: flaggedClaims,
    fraud_rate_pct: fraudRate,
    triggers_count: byTrigger.length,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  fileClaim,
  listWorkerClaims,
  getClaimById,
  getClaimStatus,
  disputeClaim,
  reviewClaim,
  resolveDispute,
  getTenantAnalytics,
};
