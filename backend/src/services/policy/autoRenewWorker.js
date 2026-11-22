'use strict';

const { Worker } = require('bullmq');
const prisma = require('../../db/prisma');
const queues = require('../../config/queues');
const { redis } = require('../../config/redis');
const logger = require('../../utils/logger');

const connection = { host: redis.options.host, port: redis.options.port };

/**
 * Core business logic for processing a policy auto-renewal job.
 *
 * Steps:
 * 1. Find policy by ID with coverages, worker, and tenant.
 * 2. Verify policy is still active and autoRenew is enabled.
 * 3. Verify worker is in good standing (status === 'active').
 * 4. Create next week's policy (start = old end_date, end = start + 7 days).
 * 5. Copy coverage rows from old policy.
 * 6. Mark old policy autoRenew to false (prevents re-renewal).
 * 7. Enqueue notification on 'notifications' queue.
 * 8. Enqueue next auto-renew job on 'policy-renew' queue (delay = endDate - 24h - now).
 * 9. Invalidate worker's cached policy list.
 *
 * @param {import('bullmq').Job} job - BullMQ job instance
 * @returns {Promise<object>} Processing outcome
 */
async function processRenewalJob(job) {
  const { policyId } = job.data;
  logger.info('Processing policy renewal job', { jobId: job.id, policyId });

  if (!policyId) {
    logger.error('Policy renewal job missing policyId', { jobId: job.id });
    return { success: false, reason: 'MISSING_POLICY_ID' };
  }

  // 1. Find policy by ID with coverages and worker
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: {
      coverages: true,
      worker: true,
      tenant: true,
    },
  });

  if (!policy) {
    logger.warn(`Policy ${policyId} not found for renewal`, { jobId: job.id, policyId });
    return { success: false, reason: 'POLICY_NOT_FOUND' };
  }

  // 2. Check if policy is still active and auto_renew enabled
  if (!policy.isActive || policy.status !== 'active') {
    logger.info(
      `Policy ${policyId} is not active (status: ${policy.status}, isActive: ${policy.isActive}), skipping auto-renewal`,
      { jobId: job.id, policyId }
    );
    return { success: false, reason: 'POLICY_INACTIVE' };
  }

  if (!policy.autoRenew) {
    logger.info(`Policy ${policyId} has autoRenew disabled, skipping renewal`, { jobId: job.id, policyId });
    return { success: false, reason: 'AUTO_RENEW_DISABLED' };
  }

  // 3. Check worker in good standing
  const worker = policy.worker || (await prisma.worker.findUnique({ where: { id: policy.workerId } }));
  if (!worker || worker.status !== 'active') {
    logger.warn(
      `Worker ${policy.workerId} is not in good standing (status: ${worker ? worker.status : 'not_found'}), skipping renewal`,
      { policyId, workerId: policy.workerId }
    );
    return { success: false, reason: 'WORKER_NOT_IN_GOOD_STANDING' };
  }

  // 4. Determine dates: start = old end_date, end = start + 7 days
  const nextStartDate = new Date(policy.endDate);
  const nextEndDate = new Date(nextStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Guard against duplicate renewal in case of worker retries
  const existingRenewal = await prisma.policy.findFirst({
    where: {
      tenantId: policy.tenantId,
      workerId: policy.workerId,
      startDate: nextStartDate,
      status: { in: ['active', 'pending'] },
    },
    include: {
      coverages: true,
    },
  });

  let newPolicy;
  if (existingRenewal) {
    logger.info(`Renewal policy already exists for worker ${policy.workerId}`, {
      existingPolicyId: existingRenewal.id,
      oldPolicyId: policy.id,
    });
    newPolicy = existingRenewal;
  } else {
    // 5. Copy coverage rows from previous policy
    const coveragesToCopy = (policy.coverages || []).map((cov) => ({
      triggerType: cov.triggerType,
      isCovered: cov.isCovered,
      coveragePercentage: cov.coveragePercentage,
      thresholdValue: cov.thresholdValue,
      minimumDurationMinutes: cov.minimumDurationMinutes,
    }));

    newPolicy = await prisma.policy.create({
      data: {
        tenantId: policy.tenantId,
        workerId: policy.workerId,
        tier: policy.tier,
        premiumWeekly: policy.premiumWeekly,
        maxPayoutPerEvent: policy.maxPayoutPerEvent,
        maxPayoutsPerMonth: policy.maxPayoutsPerMonth,
        coverageCeiling: policy.coverageCeiling,
        triggerDayLimit: policy.triggerDayLimit,
        coveragePercentage: policy.coveragePercentage,
        reservedAmount: 0,
        settledAmount: 0,
        startDate: nextStartDate,
        endDate: nextEndDate,
        isActive: true,
        autoRenew: true,
        status: 'active',
        coverages: {
          create: coveragesToCopy,
        },
      },
      include: {
        coverages: true,
      },
    });

    logger.info(`Created new policy ${newPolicy.id} via auto-renewal from ${policy.id}`);
  }

  // 6. Disable autoRenew on the old policy so it won't be processed again
  try {
    await prisma.policy.update({
      where: { id: policy.id },
      data: { autoRenew: false },
    });
  } catch (updateErr) {
    logger.warn('Failed to update old policy autoRenew flag', { error: updateErr.message, policyId: policy.id });
  }

  // 7. Enqueue notification to the 'notifications' queue
  try {
    const notifQueue = queues['notifications'];
    if (notifQueue) {
      await notifQueue.add('policy-renewed', {
        tenantId: newPolicy.tenantId,
        workerId: newPolicy.workerId,
        notificationType: 'POLICY_RENEWED',
        channel: 'sms',
        title: 'Policy Auto-Renewed',
        body: `Your Kavach insurance policy (Tier ${newPolicy.tier}) has been successfully auto-renewed for another week.`,
        metadata: {
          oldPolicyId: policy.id,
          newPolicyId: newPolicy.id,
          tier: newPolicy.tier,
          premiumWeekly: Number(newPolicy.premiumWeekly),
          startDate: newPolicy.startDate,
          endDate: newPolicy.endDate,
        },
      });
      logger.info(`Enqueued renewal notification for worker ${newPolicy.workerId}`);
    }
  } catch (notifErr) {
    logger.warn('Failed to enqueue policy renewal notification', {
      error: notifErr.message,
      policyId: newPolicy.id,
    });
  }

  // 8. Enqueue next auto-renew job (delay = endDate - 24h - now)
  try {
    const renewQueue = queues['policy-renew'];
    if (renewQueue) {
      const nextDelayMs = Math.max(
        0,
        new Date(newPolicy.endDate).getTime() - 24 * 60 * 60 * 1000 - Date.now()
      );
      const nextJobId = `policy-renew-${newPolicy.id}`;

      await renewQueue.add(
        'policy-renew',
        {
          policyId: newPolicy.id,
          workerId: newPolicy.workerId,
          tenantId: newPolicy.tenantId,
          tier: newPolicy.tier,
        },
        {
          jobId: nextJobId,
          delay: nextDelayMs,
        }
      );

      logger.info(`Enqueued next auto-renewal job ${nextJobId} with delay ${nextDelayMs}ms`);
    }
  } catch (queueErr) {
    logger.error('Failed to enqueue next auto-renew job', {
      error: queueErr.message,
      policyId: newPolicy.id,
    });
  }

  // 9. Invalidate cached worker policy list
  try {
    const cacheKey = `policies:list:${newPolicy.tenantId}:${newPolicy.workerId}`;
    await redis.del(cacheKey);
  } catch (cacheErr) {
    logger.warn('Failed to invalidate policy list cache after renewal', { error: cacheErr.message });
  }

  return {
    success: true,
    oldPolicyId: policy.id,
    newPolicyId: newPolicy.id,
    workerId: newPolicy.workerId,
  };
}

// Instantiate the BullMQ worker
const autoRenewWorker = new Worker(
  'policy-renew',
  processRenewalJob,
  {
    connection,
    concurrency: 5,
  }
);

autoRenewWorker.on('completed', (job, result) => {
  logger.info(`Policy renewal job ${job.id} completed successfully`, { result });
});

autoRenewWorker.on('failed', (job, err) => {
  logger.error(`Policy renewal job ${job ? job.id : 'unknown'} failed`, {
    error: err.message,
    stack: err.stack,
  });
});

autoRenewWorker.on('error', (err) => {
  logger.error('Policy renewal worker encountered an error', { error: err.message });
});

// Standalone execution handling
if (require.main === module) {
  logger.info('Policy Auto-Renew Worker process started');

  const shutdown = async () => {
    logger.info('Shutting down Policy Auto-Renew Worker…');
    try {
      await autoRenewWorker.close();
      logger.info('Policy Auto-Renew Worker closed successfully');
    } catch (err) {
      logger.error('Error during Policy Auto-Renew Worker shutdown', { error: err.message });
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = {
  autoRenewWorker,
  processRenewalJob,
};
