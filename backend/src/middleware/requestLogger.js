'use strict';

const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Attach a unique request ID to every incoming request.
 */
function attachRequestId(req, _res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  next();
}

/**
 * Morgan token registrations for structured logging.
 */
morgan.token('request-id', (req) => req.id || '-');
morgan.token('tenant-id', (req) => req.tenantId || '-');
morgan.token('user-id', (req) => (req.auth && req.auth.sub) || '-');

/**
 * Stream morgan output through winston.
 */
const stream = {
  write: (message) => {
    // Remove trailing newline
    const trimmed = message.trim();
    logger.http(trimmed);
  },
};

/**
 * Structured request logging middleware.
 * Outputs JSON-compatible log lines with request context.
 */
const requestLogger = morgan(
  (tokens, req, res) => {
    return JSON.stringify({
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: Number(tokens.status(req, res)),
      content_length: tokens.res(req, res, 'content-length') || '0',
      response_time_ms: Number(tokens['response-time'](req, res)),
      request_id: tokens['request-id'](req, res),
      tenant_id: tokens['tenant-id'](req, res),
      user_id: tokens['user-id'](req, res),
      user_agent: tokens['user-agent'](req, res),
      remote_addr: tokens['remote-addr'](req, res),
    });
  },
  { stream }
);

module.exports = { attachRequestId, requestLogger };
