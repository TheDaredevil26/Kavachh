'use strict';

const prisma = require('../../db/prisma');
const { forTenant } = require('../../db/tenantClient');
const { cached } = require('../../cache/cached');
const { redis } = require('../../config/redis');
const queues = require('../../config/queues');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

/**
 * Standard tier configuration:
 * Tier 1: premium=49,  max_payout_per_event=200, max_payouts_per_month=3, coverage_ceiling=600,  trigger_day_limit=3
 * Tier 2: premium=89,  max_payout_per_event=350, max_payouts_per_month=4, coverage_ceiling=1400, trigger_day_limit=4
 * Tier 3: premium=129, max_payout_per_event=500, max_payouts_per_month=6, coverage_ceiling=3000, trigger_day_limit=6
 */
const TIERS = Object.freeze({
  1: {
    tier: 1,
    name: 'Tier 1 - Basic',
    premium: 49,
    max_payout_per_event: 200,
    max_payouts_per_month: 3,
    coverage_ceiling: 600,
    trigger_day_limit: 3,
    triggers_covered: ['rainfall', 'heat', 'aqi', 'curfew', 'platform_outage'],
    description: 'Essential parametric cover for quick-commerce delivery partners.',
  },
  2: {
    tier: 2,
    name: 'Tier 2 - Standard',
    premium: 89,
    max_payout_per_event: 350,
    max_payouts_per_month: 4,
    coverage_ceiling: 1400,
    trigger_day_limit: 4,
    triggers_covered: ['rainfall', 'heat', 'aqi', 'curfew', 'platform_outage'],
    description: 'Comprehensive mid-tier cover offering balanced protection and payouts.',
  },
  3: {
    tier: 3,
    name: 'Tier 3 - Plus',
    premium: 129,
    max_payout_per_event: 500,
    max_payouts_per_month: 6,
    coverage_ceiling: 3000,
    trigger_day_limit: 6,
    triggers_covered: ['rainfall', 'heat', 'aqi', 'curfew', 'platform_outage'],
    description: 'Maximum parametric cover for full disruption protection.',
  },
});

/**
 * Default parametric triggers configuration.
 */
const DEFAULT_TRIGGER_COVERAGES = Object.freeze([
  {
    triggerType: 'rainfall',
    isCovered: true,
    coveragePercentage: 100.0,
    thresholdValue: 15.0, // 15 mm/hr
    minimumDurationMinutes: 60,
  },
  {
    triggerType: 'heat',
    isCovered: true,
    coveragePercentage: 100.0,
    thresholdValue: 42.0, // 42°C
    minimumDurationMinutes: 120,
  },
  {
    triggerType: 'aqi',
    isCovered: true,
    coveragePercentage: 100.0,
    thresholdValue: 300.0, // AQI > 300
    minimumDurationMinutes: 180,
  },
  {
    triggerType: 'curfew',
    isCovered: true,
    coveragePercentage: 100.0,
    thresholdValue: 1.0, // active curfew order
    minimumDurationMinutes: 60,
  },
  {
    triggerType: 'platform_outage',
    isCovered: true,
    coveragePercentage: 100.0,
    thresholdValue: 1.0, // backend outage detected
    minimumDurationMinutes: 30,
  },
]);

/**
 * Standard API response helper.
 *
 * @param {object} res - Express response
 * @param {number} statusCode - HTTP status code
 * @param {object} data - Response payload
 * @param {object} req - Express request
 */
function sendResponse(res, statusCode, data, req) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      request_id: req.id || req.headers['x-request-id'] || 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Formats a Policy record for API responses.
 *
 * @param {object} policy - Policy model instance
 * @returns {object} Formatted policy object
 */
function formatPolicy(policy) {
  if (!policy) return null;

  return {
    id: policy.id,
    policy_id: policy.id,
    tenant_id: policy.tenantId || policy.tenant_id,
    worker_id: policy.workerId || policy.worker_id,
    tier: policy.tier,
    premium_weekly: Number(policy.premiumWeekly ?? policy.premium_weekly),
    max_payout_per_event: Number(policy.maxPayoutPerEvent ?? policy.max_payout_per_event),
    max_payouts_per_month: policy.maxPayoutsPerMonth ?? policy.max_payouts_per_month,
    coverage_ceiling: Number(policy.coverageCeiling ?? policy.coverage_ceiling),
    trigger_day_limit: policy.triggerDayLimit ?? policy.trigger_day_limit,
    coverage_percentage: Number(policy.coveragePercentage ?? policy.coverage_percentage ?? 100),
    reserved_amount: Number(policy.reservedAmount ?? policy.reserved_amount ?? 0),
    settled_amount: Number(policy.settledAmount ?? policy.settled_amount ?? 0),
    start_date: policy.startDate || policy.start_date,
    end_date: policy.endDate || policy.end_date,
    is_active: policy.isActive ?? policy.is_active ?? true,
    auto_renew: policy.autoRenew ?? policy.auto_renew ?? true,
    status: policy.status || 'active',
    cancellation_reason: policy.cancellationReason || policy.cancellation_reason || null,
    cancelled_at: policy.cancelledAt || policy.cancelled_at || null,
    created_at: policy.createdAt || policy.created_at,
    updated_at: policy.updatedAt || policy.updated_at,
    coverages: Array.isArray(policy.coverages) ? policy.coverages.map(formatCoverage) : undefined,
  };
}

/**
 * Formats a PolicyCoverage record for API responses.
 *
 * @param {object} cov - PolicyCoverage model instance
 * @returns {object} Formatted coverage object
 */
function formatCoverage(cov) {
  if (!cov) return null;

  return {
    id: cov.id,
    policy_id: cov.policyId || cov.policy_id,
    trigger_type: cov.triggerType || cov.trigger_type,
    is_covered: cov.isCovered ?? cov.is_covered ?? true,
    coverage_percentage: Number(cov.coveragePercentage ?? cov.coverage_percentage ?? 100),
    threshold_value: cov.thresholdValue !== null && cov.thresholdValue !== undefined ? Number(cov.thresholdValue) : null,
    minimum_duration_minutes: cov.minimumDurationMinutes ?? cov.minimum_duration_minutes ?? null,
    created_at: cov.createdAt || cov.created_at,
    updated_at: cov.updatedAt || cov.updated_at,
  };
}

/**
 * POST /api/v1/policies
 * Purchase / buy a new parametric policy.
 *
 * Requirements:
 * - Auth required (worker role or authenticated worker).
 * - Validate with buyPolicySchema (tier, auto_renew).
 * - Check platform_verified_at exists on worker, else throw PLATFORM_NOT_LINKED 400.
 * - Calculate premium = tierBase * tenant.premiumMultiplier.
 * - start_date = today, end_date = today + 7 days.
 * - Create policy + 5 policy_coverage rows (rainfall, heat, aqi, curfew, platform_outage).
 * - Handle unique constraint violation -> 409 POLICY_ALREADY_ACTIVE.
 * - If auto_renew, enqueue delayed policy-renew BullMQ job (delay = endDate - 24h - now).
 * - Return 201 with policy details + waiting_period_ends_at (created_at + 72h).
 */
async function buyPolicy(req, res, next) {
  try {
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && req.auth.tenant_id;

    if (!workerId || !tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Valid worker authentication credentials required');
    }

    const { tier, auto_renew } = req.body;

    // 1. Check worker existence & platform verification status
    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
    });

    if (!worker) {
      throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found');
    }

    if (worker.status !== 'active') {
      throw new AppError('WORKER_SUSPENDED', 403, `Worker account is ${worker.status}`);
    }

    const isPlatformVerified = Boolean(worker.platformVerifiedAt || worker.platform_verified_at);
    if (!isPlatformVerified) {
      throw new AppError(
        'PLATFORM_NOT_LINKED',
        400,
        'Worker platform account must be linked and verified before purchasing a policy'
      );
    }

    // 2. Validate tier configuration
    const tierConfig = TIERS[tier];
    if (!tierConfig) {
      throw new AppError('INVALID_TIER', 400, `Invalid policy tier '${tier}'. Supported tiers: 1, 2, 3`);
    }

    // 3. Retrieve tenant and calculate weekly premium
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new AppError('TENANT_NOT_FOUND', 404, `Tenant '${tenantId}' not found`);
    }

    if (!tenant.isActive) {
      throw new AppError('TENANT_INACTIVE', 403, 'Tenant account is inactive');
    }

    const multiplier = Number(tenant.premiumMultiplier ?? tenant.premium_multiplier ?? 1.0);
    const tierBase = tierConfig.premium;
    const calculatedPremium = Math.round(tierBase * multiplier * 100) / 100;

    // 4. Determine policy validity dates (today -> today + 7 days)
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 5. Pre-check for already active overlapping policy
    const existingActivePolicy = await prisma.policy.findFirst({
      where: {
        workerId,
        tenantId,
        isActive: true,
        status: 'active',
        endDate: { gte: now },
      },
    });

    if (existingActivePolicy) {
      throw new AppError('POLICY_ALREADY_ACTIVE', 409, 'An active policy already exists for this worker');
    }

    // 6. Build the 5 coverage rows
    const coveragesData = DEFAULT_TRIGGER_COVERAGES.map((cov) => ({
      triggerType: cov.triggerType,
      isCovered: cov.isCovered,
      coveragePercentage: cov.coveragePercentage,
      thresholdValue: cov.thresholdValue,
      minimumDurationMinutes: cov.minimumDurationMinutes,
    }));

    // 7. Create policy and coverage rows atomically
    let policy;
    const shouldAutoRenew = auto_renew !== false;

    try {
      policy = await prisma.policy.create({
        data: {
          tenantId,
          workerId,
          tier,
          premiumWeekly: calculatedPremium,
          maxPayoutPerEvent: tierConfig.max_payout_per_event,
          maxPayoutsPerMonth: tierConfig.max_payouts_per_month,
          coverageCeiling: tierConfig.coverage_ceiling,
          triggerDayLimit: tierConfig.trigger_day_limit,
          coveragePercentage: 100.0,
          reservedAmount: 0,
          settledAmount: 0,
          startDate,
          endDate,
          isActive: true,
          autoRenew: shouldAutoRenew,
          status: 'active',
          coverages: {
            create: coveragesData,
          },
        },
        include: {
          coverages: true,
        },
      });
    } catch (err) {
      // Catch Prisma or database unique constraint violations
      if (
        err.code === 'P2002' ||
        (err.message && (err.message.includes('unique constraint') || err.message.includes('duplicate key')))
      ) {
        throw new AppError('POLICY_ALREADY_ACTIVE', 409, 'An active policy already exists for this worker');
      }
      throw err;
    }

    logger.info('Policy purchased successfully', {
      policyId: policy.id,
      workerId,
      tenantId,
      tier,
      premium: calculatedPremium,
      autoRenew: shouldAutoRenew,
    });

    // 8. If auto_renew, enqueue delayed policy-renew BullMQ job (delay = endDate - 24h - now)
    if (shouldAutoRenew) {
      try {
        const renewQueue = queues['policy-renew'];
        if (renewQueue) {
          const renewTime = new Date(endDate).getTime() - 24 * 60 * 60 * 1000;
          const delay = Math.max(0, renewTime - Date.now());
          const jobId = `policy-renew-${policy.id}`;

          await renewQueue.add(
            'policy-renew',
            {
              policyId: policy.id,
              workerId,
              tenantId,
              tier: policy.tier,
            },
            {
              jobId,
              delay,
            }
          );

          logger.info(`Scheduled auto-renewal job ${jobId} with delay ${delay}ms`);
        }
      } catch (queueErr) {
        logger.error('Failed to enqueue auto-renew job', {
          policyId: policy.id,
          error: queueErr.message,
        });
        // Non-fatal: policy is created, renewal worker or cron can reschedule
      }
    }

    // 9. Invalidate cached worker policy list
    try {
      const cacheKey = `policies:list:${tenantId}:${workerId}`;
      await redis.del(cacheKey);
    } catch (cacheErr) {
      logger.warn('Failed to invalidate policy list cache', { error: cacheErr.message });
    }

    // 10. Calculate waiting_period_ends_at = created_at + 72h
    const createdAtTime = new Date(policy.createdAt).getTime();
    const waitingPeriodEndsAt = new Date(createdAtTime + 72 * 60 * 60 * 1000).toISOString();

    const formatted = formatPolicy(policy);
    return sendResponse(
      res,
      201,
      {
        ...formatted,
        waiting_period_ends_at: waitingPeriodEndsAt,
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/policies
 * List worker's policies (tenant-scoped).
 * Cached for 1 hour (3600 seconds).
 */
async function listPolicies(req, res, next) {
  try {
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && req.auth.tenant_id;

    if (!tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Tenant authentication required');
    }

    // Admins can view all policies for a tenant or filter by worker_id query param
    const isWorker = !req.auth.role || req.auth.role === 'worker';
    const targetWorkerId = isWorker ? workerId : req.query.worker_id || null;

    if (isWorker && !targetWorkerId) {
      throw new AppError('UNAUTHORIZED', 401, 'Worker identification missing from authentication token');
    }

    const cacheKey = targetWorkerId
      ? `policies:list:${tenantId}:${targetWorkerId}`
      : `policies:list:${tenantId}:all`;

    const policies = await cached(cacheKey, 3600, async () => {
      const db = forTenant(tenantId);
      const whereClause = targetWorkerId ? { workerId: targetWorkerId } : {};

      const rows = await db.policy.findMany({
        where: whereClause,
        include: {
          coverages: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return rows.map(formatPolicy);
    });

    return sendResponse(res, 200, policies, req);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/policies/:id
 * Get a single policy by ID with coverages (tenant-scoped & worker-scoped).
 */
async function getPolicyById(req, res, next) {
  try {
    const { id } = req.params;
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && req.auth.tenant_id;
    const role = req.auth && req.auth.role;

    if (!tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Tenant authentication required');
    }

    const db = forTenant(tenantId);
    const whereClause = { id };

    // Restrict workers to only their own policies
    if (role === 'worker' && workerId) {
      whereClause.workerId = workerId;
    }

    const policy = await db.policy.findFirst({
      where: whereClause,
      include: {
        coverages: true,
      },
    });

    if (!policy) {
      throw new AppError('POLICY_NOT_FOUND', 404, `Policy with ID '${id}' not found`);
    }

    return sendResponse(res, 200, formatPolicy(policy), req);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/policies/:id
 * Cancel policy:
 * - Set status='cancelled', is_active=false.
 * - Remove BullMQ renew job by jobId (`policy-renew-${id}`).
 * - Invalidate cached policies list.
 */
async function cancelPolicy(req, res, next) {
  try {
    const { id } = req.params;
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && req.auth.tenant_id;
    const role = req.auth && req.auth.role;

    if (!tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Tenant authentication required');
    }

    const db = forTenant(tenantId);
    const whereClause = { id };

    if (role === 'worker' && workerId) {
      whereClause.workerId = workerId;
    }

    const policy = await db.policy.findFirst({
      where: whereClause,
    });

    if (!policy) {
      throw new AppError('POLICY_NOT_FOUND', 404, `Policy with ID '${id}' not found`);
    }

    if (policy.status === 'cancelled') {
      throw new AppError('POLICY_ALREADY_CANCELLED', 400, 'Policy is already cancelled');
    }

    const reason = req.body && req.body.cancellation_reason
      ? String(req.body.cancellation_reason).slice(0, 255)
      : 'Worker requested cancellation';

    // 1. Update policy status in database
    const updatedPolicy = await db.policy.update({
      where: { id },
      data: {
        status: 'cancelled',
        isActive: false,
        autoRenew: false,
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
      include: {
        coverages: true,
      },
    });

    logger.info('Policy cancelled successfully', {
      policyId: id,
      workerId: policy.workerId,
      tenantId,
      reason,
    });

    // 2. Remove BullMQ renew job by jobId
    try {
      const renewQueue = queues['policy-renew'];
      if (renewQueue) {
        const potentialJobIds = [`policy-renew-${id}`, `renew:${id}`];
        for (const jid of potentialJobIds) {
          const job = await renewQueue.getJob(jid);
          if (job) {
            await job.remove();
            logger.info(`Removed policy auto-renew job ${jid}`);
          }
        }
      }
    } catch (queueErr) {
      logger.warn('Failed to remove renew job from BullMQ queue', {
        policyId: id,
        error: queueErr.message,
      });
    }

    // 3. Invalidate worker's cached policy list
    try {
      const cacheKey = `policies:list:${tenantId}:${policy.workerId}`;
      await redis.del(cacheKey);
    } catch (cacheErr) {
      logger.warn('Failed to invalidate policy list cache on cancel', { error: cacheErr.message });
    }

    return sendResponse(
      res,
      200,
      {
        message: 'Policy cancelled successfully',
        policy: formatPolicy(updatedPolicy),
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/policies/:id/coverage
 * Coverage details per trigger type.
 */
async function getPolicyCoverage(req, res, next) {
  try {
    const { id } = req.params;
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && req.auth.tenant_id;
    const role = req.auth && req.auth.role;

    if (!tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Tenant authentication required');
    }

    const db = forTenant(tenantId);
    const whereClause = { id };

    if (role === 'worker' && workerId) {
      whereClause.workerId = workerId;
    }

    const policy = await db.policy.findFirst({
      where: whereClause,
      include: {
        coverages: true,
      },
    });

    if (!policy) {
      throw new AppError('POLICY_NOT_FOUND', 404, `Policy with ID '${id}' not found`);
    }

    const formattedCoverages = (policy.coverages || []).map(formatCoverage);

    // Build structured trigger type mapping
    const coverageByType = {};
    for (const cov of formattedCoverages) {
      coverageByType[cov.trigger_type] = cov;
    }

    return sendResponse(
      res,
      200,
      {
        policy_id: policy.id,
        tier: policy.tier,
        status: policy.status,
        is_active: policy.isActive,
        max_payout_per_event: Number(policy.maxPayoutPerEvent),
        max_payouts_per_month: policy.maxPayoutsPerMonth,
        coverage_ceiling: Number(policy.coverageCeiling),
        trigger_day_limit: policy.triggerDayLimit,
        coverage_percentage: Number(policy.coveragePercentage),
        coverages: formattedCoverages,
        coverage_by_type: coverageByType,
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/policies/tiers
 * Static tier information. NO auth required. Cached for 24 hours (86400 seconds).
 */
async function getTiers(req, res, next) {
  try {
    const cacheKey = 'policies:tiers:static';

    const tiers = await cached(cacheKey, 86400, async () => {
      return [
        TIERS[1],
        TIERS[2],
        TIERS[3],
      ];
    });

    return sendResponse(res, 200, tiers, req);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  TIERS,
  DEFAULT_TRIGGER_COVERAGES,
  buyPolicy,
  listPolicies,
  getPolicyById,
  cancelPolicy,
  getPolicyCoverage,
  getTiers,
  formatPolicy,
  formatCoverage,
};
