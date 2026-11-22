'use strict';

const prisma = require('../../db/prisma');
const queues = require('../../config/queues');
const { AppError } = require('../../middleware/errorHandler');

/**
 * Format standard Kavach API envelope response.
 */
function sendResponse(res, statusCode, data, req) {
  return res.status(statusCode).json({
    success: true,
    data,
    error: null,
    meta: {
      request_id: req.id || req.requestId || 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Enqueue a new notification job onto the 'notifications' BullMQ queue.
 * POST /api/v1/notifications/send
 */
async function sendNotification(req, res, next) {
  try {
    const {
      workerId,
      tenantId,
      type = 'general',
      title,
      message,
      body,
      channel = 'sms',
      metadata,
      phoneNumber,
      claimId,
      amount,
    } = req.body;

    const targetWorkerId = workerId || (req.auth ? req.auth.sub : null);
    const targetTenantId = tenantId || (req.auth ? req.auth.tenant_id : null);

    if (!targetWorkerId) {
      return next(new AppError('VALIDATION_ERROR', 400, 'workerId is required to send notification'));
    }

    const notifQueue = queues['notifications'];
    if (!notifQueue) {
      return next(new AppError('QUEUE_UNAVAILABLE', 503, 'Notifications queue is currently unavailable'));
    }

    const job = await notifQueue.add(type, {
      workerId: targetWorkerId,
      tenantId: targetTenantId,
      type,
      title,
      message: message || body,
      channel,
      metadata: metadata || (claimId ? { claimId, amount } : undefined),
      phoneNumber,
      claimId,
      amount,
    });

    return sendResponse(
      res,
      202,
      {
        enqueued: true,
        jobId: job.id,
        workerId: targetWorkerId,
        type,
        channel,
      },
      req
    );
  } catch (err) {
    next(err);
  }
}

/**
 * List recent notifications from notification_log table.
 * GET /api/v1/notifications
 */
async function listNotifications(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const where = {};

    // If caller is authenticated worker, restrict to their own notifications
    if (req.auth && req.auth.role === 'worker') {
      where.workerId = req.auth.sub;
    } else if (req.query.workerId) {
      where.workerId = req.query.workerId;
    }

    if (req.auth && req.auth.role === 'admin' && req.auth.tenant_id) {
      where.tenantId = req.auth.tenant_id;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (req.query.type) {
      where.notificationType = req.query.type;
    }

    const [notifications, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notificationLog.count({ where }),
    ]);

    return sendResponse(
      res,
      200,
      {
        notifications,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      req
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Get notification log for a specific worker.
 * GET /api/v1/notifications/worker/:workerId
 */
async function getWorkerNotifications(req, res, next) {
  try {
    const { workerId } = req.params;

    // Authorization check: workers can only view their own notifications
    if (req.auth && req.auth.role === 'worker' && req.auth.sub !== workerId) {
      return next(new AppError('FORBIDDEN', 403, 'Cannot access another worker notifications'));
    }

    const notifications = await prisma.notificationLog.findMany({
      where: { workerId },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    return sendResponse(
      res,
      200,
      {
        workerId,
        notifications,
        total: notifications.length,
      },
      req
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendNotification,
  listNotifications,
  getWorkerNotifications,
  sendResponse,
};
