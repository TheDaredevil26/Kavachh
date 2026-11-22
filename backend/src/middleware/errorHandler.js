'use strict';

const logger = require('../utils/logger');
const { metrics } = require('./metrics');

/**
 * Application-level error with a machine-readable code.
 */
class AppError extends Error {
  /**
   * @param {string} code        - Machine-readable error code (e.g., "CLAIM_NOT_FOUND")
   * @param {number} statusCode  - HTTP status code
   * @param {string} message     - Human-readable message
   * @param {boolean} [isOperational=true] - Operational (true) vs programmer error (false)
   */
  constructor(code, statusCode, message, isOperational = true) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Express global error handler middleware.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.isOperational ? err.message : 'An unexpected error occurred';
  const requestId = req.headers['x-request-id'] || req.id || 'unknown';

  // Track illegal state transitions
  if (code === 'ILLEGAL_TRANSITION') {
    metrics.illegalTransitions.inc({
      tenant_id: req.tenantId || 'unknown',
    });
  }

  // Log operational errors as warnings, bugs as critical errors
  if (err.isOperational) {
    logger.warn('Operational error', {
      code,
      statusCode,
      message: err.message,
      request_id: requestId,
      path: req.originalUrl,
      method: req.method,
    });
  } else {
    logger.error('Unexpected error', {
      code,
      statusCode,
      message: err.message,
      stack: err.stack,
      request_id: requestId,
      path: req.originalUrl,
      method: req.method,
    });
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code,
      message,
    },
    meta: {
      request_id: requestId,
    },
  });
}

module.exports = { AppError, errorHandler };
