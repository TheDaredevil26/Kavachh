'use strict';

let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch (_) {
  const crypto = require('crypto');
  uuidv4 = crypto.randomUUID ? crypto.randomUUID.bind(crypto) : () => crypto.randomBytes(16).toString('hex');
}
const logger = require('../utils/logger');
const { metrics } = require('../middleware/metrics');

/**
 * Server-Sent Events (SSE) Hub managing multi-channel connections,
 * heartbeat timers, per-user connection limits, and graceful shutdown.
 */
class SseHub {
  /**
   * @param {object} [options]
   * @param {number} [options.maxConnectionsPerUser=3]  - Max concurrent SSE connections per user
   * @param {number} [options.heartbeatMs=25000]        - Keep-alive heartbeat interval in milliseconds
   */
  constructor(options = {}) {
    /** @type {Map<string, Set<object>>} channelName -> Set of connected client objects */
    this.channels = new Map();

    /** @type {Map<string, Set<object>>} userId -> Set of client objects */
    this.perUser = new Map();

    this.MAX_CONNECTIONS_PER_USER = options.maxConnectionsPerUser || 3;
    this.HEARTBEAT_MS = options.heartbeatMs || 25000;
  }

  /**
   * Subscribe an incoming HTTP request/response to a designated SSE channel.
   * Sets appropriate SSE headers, initiates heartbeat, enforces per-user concurrency limits,
   * and registers cleanup listeners for disconnects and errors.
   *
   * @param {string} channel                     - Logical channel name (e.g. 'claim:UUID', 'worker:UUID', 'admin:blinkit')
   * @param {string|null} userId                 - Unique user/worker ID for concurrency limiting
   * @param {import('express').Request} req      - Express request object
   * @param {import('express').Response} res     - Express response object
   * @returns {object|null} The registered client object, or null if connection was rejected
   */
  subscribe(channel, userId, req, res) {
    if (!channel || typeof channel !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CHANNEL',
          message: 'A valid channel name is required for SSE subscription',
        },
      });
      return null;
    }

    // 1. Enforce per-user concurrent connection limit
    if (userId) {
      const userConnections = this.perUser.get(userId);
      if (userConnections && userConnections.size >= this.MAX_CONNECTIONS_PER_USER) {
        logger.warn('SSE max connections per user exceeded', {
          userId,
          channel,
          activeCount: userConnections.size,
          limit: this.MAX_CONNECTIONS_PER_USER,
        });

        res.status(429).json({
          success: false,
          error: {
            code: 'MAX_SSE_CONNECTIONS_EXCEEDED',
            message: `User has reached the maximum of ${this.MAX_CONNECTIONS_PER_USER} active SSE connections`,
          },
        });
        return null;
      }
    }

    // 2. Set standard SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx proxy response buffering
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // 3. Send initial connect frame
    res.write(': connected\n\n');

    const tenantId = (req.auth && req.auth.tenant_id) || req.tenantId || 'global';
    const clientId = uuidv4();

    // 4. Set up periodic heartbeat ping
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (err) {
        logger.warn('SSE heartbeat write error, closing client', { clientId, channel, error: err.message });
        cleanup();
      }
    }, this.HEARTBEAT_MS);

    // Unref so heartbeat doesn't prevent Node process exit in tests
    if (typeof heartbeatTimer.unref === 'function') {
      heartbeatTimer.unref();
    }

    const client = {
      id: clientId,
      channel,
      userId: userId || null,
      tenantId,
      req,
      res,
      heartbeatTimer,
      connectedAt: new Date(),
    };

    // 5. Register in channel map
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(client);

    // 6. Register in per-user map
    if (userId) {
      if (!this.perUser.has(userId)) {
        this.perUser.set(userId, new Set());
      }
      this.perUser.get(userId).add(client);
    }

    // 7. Increment metric
    try {
      metrics.sseConnections.inc({ tenant_id: tenantId });
    } catch (_) {}

    logger.info('SSE client connected', {
      clientId,
      channel,
      userId: userId || 'anonymous',
      tenantId,
      channelSubscribers: this.channels.get(channel).size,
    });

    // 8. Idempotent cleanup on client disconnect or error
    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) {
        return;
      }
      isCleanedUp = true;

      clearInterval(heartbeatTimer);

      // Remove from channels map
      const channelSet = this.channels.get(channel);
      if (channelSet) {
        channelSet.delete(client);
        if (channelSet.size === 0) {
          this.channels.delete(channel);
        }
      }

      // Remove from perUser map
      if (userId) {
        const userSet = this.perUser.get(userId);
        if (userSet) {
          userSet.delete(client);
          if (userSet.size === 0) {
            this.perUser.delete(userId);
          }
        }
      }

      // Decrement metric
      try {
        metrics.sseConnections.dec({ tenant_id: tenantId });
      } catch (_) {}

      try {
        if (!res.writableEnded) {
          res.end();
        }
      } catch (_) {}

      logger.info('SSE client disconnected', {
        clientId,
        channel,
        userId: userId || 'anonymous',
        tenantId,
      });
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);

    return client;
  }

  /**
   * Publish an event to all subscribers of a given channel.
   * Formats the payload into a compliant SSE frame:
   *   event: <event>\n
   *   data: <JSON string>\n\n
   *
   * @param {string} channel - Channel name
   * @param {string} event   - Event type identifier
   * @param {any} data       - Event payload (object, string, or primitive)
   * @returns {number} Number of clients to which the frame was dispatched
   */
  publish(channel, event, data) {
    const clients = this.channels.get(channel);
    if (!clients || clients.size === 0) {
      return 0;
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    let frame = '';
    if (event) {
      frame += `event: ${event}\n`;
    }
    frame += `data: ${payload}\n\n`;

    let deliveredCount = 0;
    for (const client of clients) {
      try {
        client.res.write(frame);
        deliveredCount++;
      } catch (err) {
        logger.error('Failed to write SSE frame to client', {
          clientId: client.id,
          channel,
          error: err.message,
        });
        try {
          client.res.destroy();
        } catch (_) {}
      }
    }

    logger.debug('SSE frame published', { channel, event, recipients: deliveredCount });
    return deliveredCount;
  }

  /**
   * Close all active connections across all channels.
   * Emits a graceful 'shutdown' frame to clients and terminates streams.
   */
  closeAll() {
    logger.info('Closing all active SSE connections');

    for (const [channel, clients] of this.channels.entries()) {
      for (const client of clients) {
        try {
          clearInterval(client.heartbeatTimer);
          client.res.write('event: shutdown\ndata: {"message":"server is shutting down"}\n\n');
          client.res.end();
        } catch (_) {}
      }
      clients.clear();
    }

    this.channels.clear();
    this.perUser.clear();
  }

  /**
   * Get telemetry stats on active SSE subscriptions.
   *
   * @returns {object}
   */
  getStats() {
    let totalConnections = 0;
    for (const clients of this.channels.values()) {
      totalConnections += clients.size;
    }

    return {
      activeChannels: this.channels.size,
      activeUsers: this.perUser.size,
      totalConnections,
    };
  }
}

const sseHub = new SseHub();

module.exports = sseHub;
module.exports.SseHub = SseHub;
module.exports.sseHub = sseHub;
