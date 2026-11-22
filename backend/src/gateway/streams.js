'use strict';

const express = require('express');
const router = express.Router();

const { redisSub } = require('../config/redis');
const sseHub = require('./sseHub');
const { authMiddleware, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

let isInitialized = false;

/**
 * Handle incoming Redis Pub/Sub messages and fan them out to relevant SSE channels.
 *
 * @param {string} channel - Channel name (e.g. 'evt:claims', 'evt:triggers', 'evt:payouts')
 * @param {string} message - JSON string payload
 */
function handleRedisMessage(channel, message) {
  try {
    const payload = typeof message === 'string' ? JSON.parse(message) : message;
    const event = payload.event || payload.type || channel.replace(/^evt:/, '');
    const data = payload.data !== undefined ? payload.data : payload;

    // 1. Publish directly to the raw Redis channel name in SSE hub
    sseHub.publish(channel, event, data);

    // 2. Extract routing identifiers for fanning out
    const claimId = payload.claimId || payload.claim_id || (data && (data.claimId || data.claim_id));
    const workerId = payload.workerId || payload.worker_id || (data && (data.workerId || data.worker_id));
    const tenantId = payload.tenantId || payload.tenant_id || (data && (data.tenantId || data.tenant_id));

    // Fan-out to claim-scoped channel
    if (claimId) {
      sseHub.publish(`claim:${claimId}`, event, data);
    }

    // Fan-out to worker-scoped channel
    if (workerId) {
      sseHub.publish(`worker:${workerId}`, event, data);
      if (tenantId) {
        sseHub.publish(`worker:${tenantId}:${workerId}`, event, data);
      }
    }

    // Fan-out to tenant-scoped admin channel
    if (tenantId) {
      sseHub.publish(`admin:${tenantId}`, event, data);
    }

    // Global admin channel
    sseHub.publish('admin:all', event, data);

    // Explicit custom target channel if specified in payload
    if (payload.targetChannel) {
      sseHub.publish(payload.targetChannel, event, data);
    }
  } catch (err) {
    logger.error('Failed to process and fan out Redis evt message', {
      channel,
      error: err.message,
    });
  }
}

/**
 * Wire the Redis subscriber to the SSE hub by subscribing to pattern 'evt:*'
 * and common event channels.
 *
 * @param {import('ioredis').Redis} [subClient=redisSub]
 * @param {import('./sseHub').SseHub} [hub=sseHub]
 */
function initStreams(subClient = redisSub, hub = sseHub) {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  try {
    // Pattern subscribe to all evt:* channels
    subClient.psubscribe('evt:*', (err, count) => {
      if (err) {
        logger.error('Failed to psubscribe to evt:* channels', { error: err.message });
      } else {
        logger.info(`Subscribed to Redis pattern 'evt:*' (${count} patterns active)`);
      }
    });

    subClient.on('pmessage', (_pattern, channel, message) => {
      handleRedisMessage(channel, message);
    });

    subClient.on('message', (channel, message) => {
      handleRedisMessage(channel, message);
    });
  } catch (err) {
    logger.error('Error wiring Redis subscriber to SSE hub', { error: err.message });
  }
}

/**
 * Teardown Redis subscriptions and close all SSE channels.
 *
 * @param {import('ioredis').Redis} [subClient=redisSub]
 * @param {import('./sseHub').SseHub} [hub=sseHub]
 */
async function closeStreams(subClient = redisSub, hub = sseHub) {
  try {
    if (subClient && typeof subClient.punsubscribe === 'function') {
      await subClient.punsubscribe('evt:*');
    }
  } catch (err) {
    logger.warn('Error unsubscribing Redis subscriber', { error: err.message });
  }

  if (hub && typeof hub.closeAll === 'function') {
    hub.closeAll();
  }

  isInitialized = false;
}

// Automatically initialize stream listener on module load
initStreams();

/**
 * Middleware: extract authentication token from query parameter if Authorization header is missing.
 * Browser EventSource API does not natively support custom HTTP headers.
 */
function extractStreamToken(req, _res, next) {
  if (!req.headers.authorization && req.query && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

/* ─────────────────────────────────────────────────────────────
 * SSE Stream Routes
 * ──────────────────────────────────────────────────────────── */

/**
 * GET /stream/claims/:id & /api/v1/stream/claims/:id
 * Real-time SSE stream for claim status, fraud evaluations, and payout updates.
 */
router.get(
  ['/stream/claims/:id', '/api/v1/stream/claims/:id'],
  extractStreamToken,
  authMiddleware,
  (req, res) => {
    const claimId = req.params.id;
    const userId = req.auth ? req.auth.sub : null;
    const channel = `claim:${claimId}`;

    sseHub.subscribe(channel, userId, req, res);
  }
);

/**
 * GET /stream/worker & /api/v1/stream/worker
 * Real-time SSE stream for authenticated worker's trigger alerts, payouts, and notifications.
 */
router.get(
  ['/stream/worker', '/api/v1/stream/worker'],
  extractStreamToken,
  authMiddleware,
  (req, res) => {
    const workerId = req.auth ? req.auth.sub : null;
    const channel = `worker:${workerId}`;

    sseHub.subscribe(channel, workerId, req, res);
  }
);

/**
 * GET /stream/admin & /api/v1/stream/admin
 * Real-time SSE stream for admin users receiving tenant-scoped claim, trigger, and payout events.
 */
router.get(
  ['/stream/admin', '/api/v1/stream/admin'],
  extractStreamToken,
  authMiddleware,
  requireRole('admin', 'tenant_admin', 'super_admin'),
  (req, res) => {
    const tenantId = (req.auth && req.auth.tenant_id) || req.query.tenantId || 'all';
    const userId = req.auth ? req.auth.sub : null;
    const channel = `admin:${tenantId}`;

    sseHub.subscribe(channel, userId, req, res);
  }
);

module.exports = {
  router,
  sseHub,
  initStreams,
  closeStreams,
  handleRedisMessage,
};
