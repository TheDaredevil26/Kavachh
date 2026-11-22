'use strict';

const prisma = require('../../db/prisma');
const { cached } = require('../../cache/cached');
const { redis } = require('../../config/redis');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const {
  formatTrigger,
  snapshotPresence,
  TRIGGER_THRESHOLDS,
} = require('./triggerService');

/**
 * Standard API response helper matching Kavach API conventions.
 *
 * @param {object} res - Express response
 * @param {number} statusCode - HTTP status code
 * @param {object} data - Response payload
 * @param {object} req - Express request
 * @param {object} [extraMeta={}] - Additional metadata fields
 */
function sendResponse(res, statusCode, data, req, extraMeta = {}) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      request_id: req.id || req.headers['x-request-id'] || 'unknown',
      timestamp: new Date().toISOString(),
      ...extraMeta,
    },
  });
}

/**
 * Helper to determine the relevant zoneId for a request.
 * Prioritizes query param 'zone_id', otherwise looks up worker profile in Prisma.
 *
 * @param {object} req - Express request
 * @returns {Promise<string>} Zone identifier
 * @throws {AppError} If zoneId cannot be resolved
 */
async function resolveZoneId(req) {
  if (req.query && req.query.zone_id) {
    return String(req.query.zone_id).trim();
  }

  if (req.auth && req.auth.sub) {
    try {
      const worker = await prisma.worker.findUnique({
        where: { id: req.auth.sub },
        select: { zoneId: true },
      });
      if (worker && worker.zoneId) {
        return worker.zoneId;
      }
    } catch (err) {
      logger.debug('Error looking up worker zone in database', { workerId: req.auth.sub, error: err.message });
    }
  }

  throw new AppError(
    'MISSING_ZONE',
    400,
    'Zone identifier could not be determined. Please supply a zone_id query parameter.'
  );
}

/**
 * Helper to lookup default threshold value by trigger type.
 *
 * @param {string} type - Trigger type
 * @returns {number} Default threshold
 */
function getDefaultThreshold(type) {
  if (TRIGGER_THRESHOLDS[type]) {
    return TRIGGER_THRESHOLDS[type].threshold;
  }
  switch (type) {
    case 'curfew':
      return 1.0;
    case 'platform_outage':
      return 75.0;
    default:
      return 0.0;
  }
}

/**
 * GET /api/v1/triggers/active
 * Get active, announced triggers for worker's zone.
 * Uses cached() with 5-minute TTL (300 seconds) on key `trigger:active:{zoneId}`.
 */
async function getActiveTriggers(req, res, next) {
  try {
    const zoneId = await resolveZoneId(req);
    const cacheKey = `trigger:active:${zoneId}`;

    const activeTriggers = await cached(cacheKey, 300, async () => {
      const now = new Date();

      const where = {
        zoneId,
        status: 'active',
        announcedAt: {
          not: null,
          lte: now,
        },
      };

      // Tenant-scoping: workers see platform-wide triggers (tenantId: null) or triggers for their own tenant
      if (req.auth && req.auth.role === 'worker' && req.auth.tenant_id) {
        where.OR = [
          { tenantId: null },
          { tenantId: req.auth.tenant_id },
        ];
      }

      const rows = await prisma.triggerEvent.findMany({
        where,
        orderBy: { announcedAt: 'desc' },
      });

      return rows.map(formatTrigger);
    });

    return sendResponse(
      res,
      200,
      {
        zone_id: zoneId,
        triggers: activeTriggers,
      },
      req,
      { cached: true, ttl_seconds: 300 }
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/triggers/:id
 * Get single trigger by ID.
 */
async function getTriggerById(req, res, next) {
  try {
    const { id } = req.params;

    const trigger = await prisma.triggerEvent.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!trigger) {
      throw new AppError('TRIGGER_NOT_FOUND', 404, `Trigger event ${id} not found`);
    }

    // Tenant authorization check: if trigger is tenant-scoped, user must belong to that tenant
    if (
      trigger.tenantId &&
      req.auth &&
      req.auth.tenant_id &&
      trigger.tenantId !== req.auth.tenant_id &&
      req.auth.role !== 'super_admin'
    ) {
      throw new AppError('FORBIDDEN', 403, 'Access denied to this tenant-specific trigger event');
    }

    return sendResponse(res, 200, formatTrigger(trigger), req);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/triggers/history
 * Get last 30 days of triggers for worker's zone.
 */
async function getTriggerHistory(req, res, next) {
  try {
    const zoneId = await resolveZoneId(req);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const skip = (page - 1) * limit;

    const where = {
      zoneId,
      detectedAt: {
        gte: thirtyDaysAgo,
      },
    };

    if (req.auth && req.auth.role === 'worker' && req.auth.tenant_id) {
      where.OR = [
        { tenantId: null },
        { tenantId: req.auth.tenant_id },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.triggerEvent.count({ where }),
      prisma.triggerEvent.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return sendResponse(
      res,
      200,
      {
        zone_id: zoneId,
        history: rows.map(formatTrigger),
      },
      req,
      {
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      }
    );
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/triggers/simulate
 * Admin-only: Simulate trigger creation.
 * Creates trigger event directly and announces it immediately (skips 8-min delay for testing).
 */
async function simulateTrigger(req, res, next) {
  try {
    const {
      trigger_type,
      zone_id,
      actual_value,
      severity,
      duration_minutes,
      tenant_id,
    } = req.body;

    // Enforce tenant scoping for tenant admins
    let effectiveTenantId = null;
    if (req.auth.role === 'tenant_admin') {
      effectiveTenantId = req.auth.tenant_id;
    } else if (req.auth.role === 'super_admin') {
      effectiveTenantId = tenant_id || null;
    }

    const now = new Date();
    const thresholdValue = getDefaultThreshold(trigger_type);

    logger.info('Simulating trigger event (immediate announcement mode)', {
      trigger_type,
      zone_id,
      actual_value,
      admin: req.auth.email || req.auth.sub,
    });

    // 1. Create TriggerEvent in DB with announcedAt = now (bypassing 8m delay)
    const trigger = await prisma.triggerEvent.create({
      data: {
        triggerType: trigger_type,
        zoneId: zone_id,
        tenantId: effectiveTenantId,
        actualValue: actual_value,
        thresholdValue,
        severity: severity || (actual_value >= thresholdValue * 1.5 ? 'high' : 'medium'),
        detectedAt: now,
        announcedAt: now, // Announced immediately
        startedAt: now,
        durationMinutes: duration_minutes || 60,
        status: 'active',
        dataSource: 'simulation',
        confirmedAt: now,
        rawData: {
          simulated: true,
          simulatedBy: req.auth.email || req.auth.sub,
          simulatedAt: now.toISOString(),
        },
      },
    });

    // 2. Perform T=0 presence snapshot (Layer F)
    try {
      await snapshotPresence(trigger);
    } catch (snapErr) {
      logger.warn('Failed presence snapshot in simulation', { error: snapErr.message });
    }

    const formatted = formatTrigger(trigger);

    // 3. Write-through active cache for this zone (TTL: 5 minutes / 300s)
    const cacheKey = `trigger:active:${zone_id}`;
    try {
      await redis.set(cacheKey, JSON.stringify([formatted]), 'EX', 300);
    } catch (redisErr) {
      logger.warn('Failed updating active trigger cache in simulation', { error: redisErr.message });
    }

    // 4. Publish real-time evt:trigger.announced event on Redis pub/sub
    try {
      await redis.publish('evt:trigger.announced', JSON.stringify(formatted));
      logger.info('Published simulated trigger to evt:trigger.announced channel');
    } catch (pubErr) {
      logger.warn('Failed to publish simulated trigger event to Redis', { error: pubErr.message });
    }

    return sendResponse(
      res,
      201,
      formatted,
      req,
      { message: 'Trigger simulated and announced immediately (8-minute delay bypassed)' }
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getActiveTriggers,
  getTriggerById,
  getTriggerHistory,
  simulateTrigger,
  resolveZoneId,
};
