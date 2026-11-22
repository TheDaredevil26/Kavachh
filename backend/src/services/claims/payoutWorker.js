'use strict';

const { Worker } = require('bullmq');
const prisma = require('../../db/prisma');
const { redis } = require('../../config/redis');
const env = require('../../config/env');
const queues = require('../../config/queues');
const { withRedisLock } = require('../../utils/lock');
const { decrypt } = require('../../utils/encryption');
const logger = require('../../utils/logger');
const { ClaimStateMachine } = require('./stateMachine');
const bankClient = require('./bankClient');
const { AppError } = require('../../middleware/errorHandler');

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };
const sm = new ClaimStateMachine(prisma, redis);

/**
 * Safely decrypt a PII value if it is encrypted, otherwise return plaintext.
 *
 * @param {string} val
 * @returns {string}
 */
function safeDecrypt(val) {
  if (!val) return '';
  if (typeof val === 'string' && val.split(':').length === 3) {
    try {
      return decrypt(val);
    } catch (_e) {
      return val;
    }
  }
  return val;
}

/**
 * Payout Worker
 * Queue: 'payout'
 *
 * Requirements:
 * 1. Redis distributed lock (`lock:payout:${claimId}`, 60s) + PostgreSQL row-level lock.
 * 2. Pre-disbursement checks:
 *    - Re-check worker status is active.
 *    - Re-check is_flagged_for_review is false.
 *    - Re-check zone fraud ring flag: if active and confidence < 0.65, freeze claim to 'held'.
 * 3. Upsert Payout entity with idempotency_key = `payout:${claimId}`.
 * 4. Execute idempotent mock bank transfer via bankClient.
 * 5. Persist outcome:
 *    - Success: transition claim to 'paid', set dispute_window_ends_at (now + 2h).
 *      Enqueue delayed BullMQ 'close-claim' job (2 hours).
 *    - Failure: transition claim to 'payout_failed'.
 */
const payoutWorker = new Worker(
  'payout',
  async (job) => {
    const { claimId } = job.data;
    logger.info('Processing payout job', { claimId, jobId: job.id });

    await withRedisLock(`lock:payout:${claimId}`, 60000, async () => {
      // 1. Pre-disbursement checks under row-level lock
      const claim = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT * FROM claims WHERE id = ${claimId}::uuid FOR UPDATE
        `;

        if (!rows || rows.length === 0) {
          throw new AppError('CLAIM_NOT_FOUND', 404, `Claim ${claimId} not found`);
        }

        const row = rows[0];

        // Idempotent completion check
        if (row.status === 'paid' || row.status === 'closed') {
          logger.info('Claim already completed payment, skipping payout', { claimId, status: row.status });
          return null;
        }

        if (row.status !== 'payout_pending') {
          logger.warn('Claim is not in payout_pending state, skipping', { claimId, status: row.status });
          return null;
        }

        const worker = await tx.worker.findUniqueOrThrow({ where: { id: row.worker_id } });

        // Check if a zone fraud ring alert was triggered while in queue
        const ringFlag = await redis.get(`zone:fraud_ring:${worker.zoneId}`);
        const confidence = Number(row.confidence_score || 0);
        const lowConfidenceInRing = Boolean(ringFlag) && confidence < 0.65;

        // FRAUD-FLAG SAFETY CHECKS before any money moves
        if (row.is_flagged_for_review || worker.status !== 'active' || lowConfidenceInRing) {
          logger.warn('Payout halted by pre-disbursement fraud guard', {
            claimId,
            workerId: worker.id,
            isFlagged: row.is_flagged_for_review,
            workerStatus: worker.status,
            lowConfidenceInRing,
          });

          await sm.transition(claimId, 'held', 'system:payout-guard', {
            tx,
            reason: 'Fraud flag raised before disbursement',
            patch: {
              isFlaggedForReview: true,
              holdReason: 'Fraud flag raised during pre-disbursement verification',
            },
          });

          // Release policy reservation
          const payoutAmt = Number(row.payout_amount || 0);
          if (payoutAmt > 0) {
            await tx.policy.update({
              where: { id: row.policy_id },
              data: { reservedAmount: { decrement: payoutAmt } },
            });
          }

          return null;
        }

        return row;
      });

      if (!claim) return;

      // 2. Upsert Payout entity (idempotency key = payout:{claimId})
      const idemKey = `payout:${claimId}`;
      const payoutAmount = Number(claim.payout_amount);

      const payout = await prisma.payout.upsert({
        where: { idempotencyKey: idemKey },
        create: {
          tenantId: claim.tenant_id,
          claimId,
          workerId: claim.worker_id,
          amount: payoutAmount,
          idempotencyKey: idemKey,
          status: 'initiated',
          initiatedAt: new Date(),
        },
        update: {},
      });

      // If already completed in an earlier attempt, no-op
      if (payout.status === 'completed') {
        logger.info('Payout already completed according to database record', { claimId, payoutId: payout.id });
        return;
      }

      // 3. Perform bank transfer via mock payment rail
      const worker = await prisma.worker.findUniqueOrThrow({ where: { id: claim.worker_id } });
      const rawAccount = safeDecrypt(worker.bankAccountNumber);
      const rawIfsc = safeDecrypt(worker.bankIfscCode);

      const bankResult = await bankClient.transfer({
        idempotencyKey: idemKey,
        account: rawAccount,
        ifsc: rawIfsc,
        amount: payoutAmount,
        reference: payout.id,
      });

      // 4. Persist transfer outcome and transition claim atomically
      await prisma.$transaction(async (tx) => {
        await tx.payout.update({
          where: { id: payout.id },
          data: {
            status: bankResult.success ? 'completed' : 'failed',
            bankReferenceNumber: bankResult.referenceNumber,
            completedAt: bankResult.success ? new Date() : null,
            failureReason: bankResult.error || null,
          },
        });

        if (bankResult.success) {
          const disputeWindowEndsAt = new Date(Date.now() + 2 * 3600 * 1000); // 2-hour window

          await sm.transition(claimId, 'paid', 'system:payout', {
            tx,
            patch: {
              payoutId: payout.id,
              payoutStatus: 'completed',
              payoutCompletedAt: new Date(),
              disputeWindowEndsAt,
            },
          });
        } else {
          await sm.transition(claimId, 'payout_failed', 'system:payout', {
            tx,
            reason: bankResult.error || 'Bank transfer failed',
            patch: {
              payoutStatus: 'failed',
            },
          });
        }
      });

      // 5. If successful, schedule delayed close-claim BullMQ job (2 hours)
      if (bankResult.success) {
        const closeQueue = queues['close-claim'];
        if (closeQueue) {
          await closeQueue.add(
            'close',
            { claimId },
            {
              delay: 2 * 3600 * 1000, // 2-hour delay
              jobId: `close:${claimId}`,
              attempts: 5,
              backoff: { type: 'exponential', delay: 10000 },
            }
          );
          logger.info('Enqueued delayed close-claim job (2h dispute window)', { claimId });
        }
      }
    });
  },
  { connection, concurrency: 10 }
);

payoutWorker.on('failed', (job, err) => {
  logger.error('payout worker job failed', { jobId: job?.id, error: err.message });
});

module.exports = payoutWorker;
