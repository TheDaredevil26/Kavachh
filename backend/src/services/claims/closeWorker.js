'use strict';

const { Worker } = require('bullmq');
const prisma = require('../../db/prisma');
const { redis } = require('../../config/redis');
const env = require('../../config/env');
const queues = require('../../config/queues');
const { withRedisLock } = require('../../utils/lock');
const logger = require('../../utils/logger');
const { ClaimStateMachine } = require('./stateMachine');

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };
const sm = new ClaimStateMachine(prisma, redis);

/**
 * Delayed Close Worker
 * Queue: 'close-claim'
 *
 * Transitions claims from 'paid' → 'closed' once the 2-hour dispute window expires.
 * Atomically settles funds on the Policy (reserved_amount → settled_amount).
 */
const closeWorker = new Worker(
  'close-claim',
  async (job) => {
    const { claimId } = job.data;
    logger.info('Processing delayed claim closure', { claimId, jobId: job.id });

    await withRedisLock(`lock:claim:${claimId}`, 15000, async () => {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT status, policy_id, payout_amount, dispute_window_ends_at
          FROM claims WHERE id = ${claimId}::uuid FOR UPDATE
        `;

        if (!rows || rows.length === 0) {
          logger.warn('Claim not found during delayed close', { claimId });
          return;
        }

        const row = rows[0];

        // If claim was disputed or already closed, do nothing
        if (row.status !== 'paid') {
          logger.info('Claim status is not "paid", skipping automatic closure', {
            claimId,
            currentStatus: row.status,
          });
          return;
        }

        const now = new Date();
        const windowEnds = row.dispute_window_ends_at ? new Date(row.dispute_window_ends_at) : null;

        // If job triggered prematurely before window elapsed, re-schedule
        if (windowEnds && now < windowEnds) {
          const remainingDelay = Math.max(1000, windowEnds.getTime() - now.getTime());
          logger.info('Dispute window still open, re-delaying close job', {
            claimId,
            remainingDelayMs: remainingDelay,
          });

          const closeQueue = queues['close-claim'];
          if (closeQueue) {
            await closeQueue.add(
              'close',
              { claimId },
              { delay: remainingDelay, jobId: `close:${claimId}:redelay:${Date.now()}` }
            );
          }
          return;
        }

        const payoutAmount = Number(row.payout_amount || 0);

        // Settle reservation: decrement reserved_amount, increment settled_amount
        await tx.$executeRaw`
          UPDATE policies
          SET reserved_amount = GREATEST(0, reserved_amount - ${payoutAmount}),
              settled_amount  = settled_amount  + ${payoutAmount}
          WHERE id = ${row.policy_id}::uuid
        `;

        // Transition claim: paid → closed
        await sm.transition(claimId, 'closed', 'system:close-window', {
          tx,
          reason: '2-hour dispute window elapsed without dispute',
          patch: { closedAt: new Date() },
        });

        logger.info('Claim closed and funds settled successfully', {
          claimId,
          policyId: row.policy_id,
          settledAmount: payoutAmount,
        });
      });
    });
  },
  { connection, concurrency: 5 }
);

closeWorker.on('failed', (job, err) => {
  logger.error('close-claim worker job failed', { jobId: job?.id, error: err.message });
});

module.exports = closeWorker;
