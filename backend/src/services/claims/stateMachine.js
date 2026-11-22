'use strict';

const prisma = require('../../db/prisma');
const { AppError } = require('../../middleware/errorHandler');
const { AuditEvent } = require('../../db/mongo');
const logger = require('../../utils/logger');
const { redis } = require('../../config/redis');

/**
 * Frozen enum of all valid claim states (PRD v2 + backwards-compatibility aliases).
 */
const ClaimState = Object.freeze({
  FILED: 'filed',
  VALIDATED: 'validated',
  SCORING: 'scoring',
  DECIDED: 'decided',
  PAYOUT_PENDING: 'payout_pending',
  PAID: 'paid',
  CLOSED: 'closed',
  HELD: 'held',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  DISPUTED: 'disputed',
  PAYOUT_FAILED: 'payout_failed',
  // Backwards-compatible aliases
  VALIDATING: 'validating',
  FRAUD_CHECK: 'fraud_check',
  AUTO_APPROVED: 'auto_approved',
  MANUAL_REVIEW: 'manual_review',
  APPROVED: 'approved',
  PARTIAL: 'partial',
});

/**
 * Frozen map of allowed state transitions.
 * Key = current state, Value = array of valid next states.
 */
const TRANSITIONS = Object.freeze({
  filed: ['validated', 'validating', 'rejected', 'cancelled'],
  validated: ['scoring', 'cancelled'],
  validating: ['fraud_check', 'scoring', 'rejected'],
  scoring: ['decided', 'rejected'],
  fraud_check: ['auto_approved', 'manual_review', 'rejected', 'decided'],
  decided: ['payout_pending', 'held'],
  held: ['payout_pending', 'rejected', 'expired'],
  auto_approved: ['paid', 'manual_review', 'payout_pending'],
  manual_review: ['approved', 'partial', 'rejected', 'payout_pending'],
  approved: ['paid', 'payout_pending'],
  partial: ['paid', 'payout_pending'],
  payout_pending: ['paid', 'payout_failed', 'held'],
  payout_failed: ['payout_pending', 'held'],
  paid: ['closed', 'disputed'],
  disputed: ['closed', 'payout_pending', 'manual_review'],
  closed: [], // terminal state
  rejected: ['disputed', 'closed'],
  cancelled: [],
  expired: [],
});

class ClaimStateMachine {
  constructor(prismaClient, bus) {
    this.prisma = prismaClient || prisma;
    this.bus = bus || redis;
  }

  /**
   * Check if a transition from one state to another is allowed.
   *
   * @param {string} from - Current state
   * @param {string} to   - Desired next state
   * @returns {boolean}
   */
  canTransition(from, to) {
    const allowed = TRANSITIONS[from];
    if (!allowed) {
      return false;
    }
    return allowed.includes(to);
  }

  /**
   * Atomically transition a claim to a new state.
   * Supports both signatures:
   *   1. transition(claimId, toState, actor, opts)
   *   2. transition({ claimId, toState, actor, actorType, actorId, reason, metadata, patch, tx })
   *
   * Uses SELECT … FOR UPDATE row lock to prevent concurrent transitions,
   * validates transition table, updates claim row and bumps stateVersion,
   * records audit trail in Postgres and MongoDB, and publishes Redis event after commit.
   *
   * @returns {Promise<object>} Updated claim record
   */
  async transition(arg1, arg2, arg3, arg4) {
    let claimId;
    let toState;
    let actor;
    let reason;
    let metadata;
    let patch = {};
    let externalTx;
    let tenantId;

    if (typeof arg1 === 'object' && arg1 !== null) {
      claimId = arg1.claimId;
      toState = arg1.toState || arg1.to;
      actor = arg1.actor || (arg1.actorType ? `${arg1.actorType}:${arg1.actorId || 'system'}` : 'system');
      reason = arg1.reason;
      metadata = arg1.metadata;
      patch = arg1.patch || {};
      externalTx = arg1.tx;
      tenantId = arg1.tenantId;
    } else {
      claimId = arg1;
      toState = arg2;
      actor = arg3 || 'system';
      const opts = arg4 || {};
      reason = opts.reason;
      metadata = opts.metadata;
      patch = opts.patch || {};
      externalTx = opts.tx;
      tenantId = opts.tenantId;
    }

    const run = async (tx) => {
      // 1. Acquire row lock
      const rows = await tx.$queryRaw`
        SELECT id, status, tenant_id, worker_id FROM claims WHERE id = ${claimId}::uuid FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw new AppError('CLAIM_NOT_FOUND', 404, `Claim ${claimId} not found`);
      }

      const claim = rows[0];
      const fromState = claim.status;
      const resolvedTenantId = tenantId || claim.tenant_id;
      const workerId = claim.worker_id;

      // 2. Validate transition
      if (!this.canTransition(fromState, toState)) {
        throw new AppError(
          'ILLEGAL_TRANSITION',
          409,
          `Cannot transition claim from "${fromState}" to "${toState}"`
        );
      }

      // 3. Build update data
      const updateData = {
        ...patch,
        status: toState,
        updatedAt: new Date(),
        stateVersion: { increment: 1 },
      };

      if (toState === ClaimState.APPROVED || toState === ClaimState.AUTO_APPROVED || toState === ClaimState.DECIDED) {
        if (!updateData.decidedAt && !updateData.decided_at) {
          updateData.reviewedAt = new Date();
        }
      }
      if (toState === ClaimState.CLOSED) {
        updateData.closedAt = updateData.closedAt || new Date();
      }
      if (metadata && metadata.approved_amount !== undefined) {
        updateData.approvedAmount = metadata.approved_amount;
      }
      if (metadata && metadata.reviewer_id) {
        updateData.reviewedBy = metadata.reviewer_id;
        updateData.reviewNotes = metadata.reviewer_notes || null;
        updateData.reviewedAt = new Date();
      }

      // 4. Update claim
      const updatedClaim = await tx.claim.update({
        where: { id: claimId },
        data: updateData,
      });

      // 5. Record state transition in Postgres (matching Prisma ClaimStateTransition model)
      await tx.claimStateTransition.create({
        data: {
          claimId,
          fromState,
          toState,
          actor: String(actor || 'system'),
          reason: reason || null,
          metadata: metadata || patch || {},
        },
      });

      return {
        updatedClaim,
        fromState,
        resolvedTenantId,
        workerId,
      };
    };

    let result;
    if (externalTx) {
      result = await run(externalTx);
    } else {
      result = await this.prisma.$transaction(run, { timeout: 10000 });
    }

    const { updatedClaim, fromState, resolvedTenantId, workerId } = result;

    // 6. Record audit event in MongoDB (non-blocking, best-effort)
    AuditEvent.create({
      actor_type: actor.startsWith('worker') ? 'worker' : actor.startsWith('admin') ? 'admin' : 'system',
      actor_id: actor,
      tenant_id: resolvedTenantId,
      action: 'claim.state_transition',
      resource_type: 'claim',
      resource_id: claimId,
      changes: { from: fromState, to: toState },
      metadata: { reason, ...metadata, ...patch },
    }).catch((err) => {
      logger.error('Failed to write audit event to MongoDB', { error: err.message, claimId });
    });

    // 7. Publish event to Redis after commit
    setImmediate(async () => {
      try {
        const payload = JSON.stringify({
          claim_id: claimId,
          claimId,
          tenant_id: resolvedTenantId,
          tenantId: resolvedTenantId,
          worker_id: workerId,
          workerId,
          from_state: fromState,
          from: fromState,
          to_state: toState,
          to: toState,
          actor,
          timestamp: new Date().toISOString(),
        });

        await redis.publish('claim:state-change', payload);
        await redis.publish('evt:claim.state_changed', payload);
      } catch (err) {
        logger.error('Failed to publish claim state-change event', {
          error: err.message,
          claimId,
        });
      }
    });

    logger.info('Claim state transitioned', {
      claim_id: claimId,
      from: fromState,
      to: toState,
      actor,
    });

    return updatedClaim;
  }
}

module.exports = { ClaimState, TRANSITIONS, ClaimStateMachine };
