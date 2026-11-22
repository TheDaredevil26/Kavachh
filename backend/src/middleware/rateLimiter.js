'use strict';

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const { redis } = require('../config/redis');
const { AppError } = require('./errorHandler');

/**
 * Create a rate limiter middleware with Redis-backed store.
 *
 * @param {object} opts
 * @param {number} opts.windowMs       - Window duration in ms (default: 60000)
 * @param {number} opts.max            - Max requests per window (default: 1000)
 * @param {string} [opts.prefix]       - Redis key prefix
 * @param {string} [opts.message]      - Error message
 * @returns {Function} Express middleware
 */
function createRateLimiter({ windowMs = 60000, max = 1000, prefix = 'rl:', message = 'Too many requests' } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    }),
    keyGenerator: (req) => {
      // Use authenticated user ID if available, otherwise IP
      return req.auth ? `${req.auth.sub}` : req.ip;
    },
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMIT_EXCEEDED', 429, message));
    },
  });
}

/** Default limiter: 1000 req/min per user */
const defaultLimiter = createRateLimiter({
  windowMs: 60000,
  max: 1000,
  prefix: 'rl:default:',
  message: 'Too many requests, please try again later',
});

/** Auth limiter: 30 req/min per IP */
const authLimiter = createRateLimiter({
  windowMs: 60000,
  max: 30,
  prefix: 'rl:auth:',
  message: 'Too many authentication attempts, please try again later',
});

/** QR check-in limiter: 20 req/min per user */
const qrCheckinLimiter = createRateLimiter({
  windowMs: 60000,
  max: 20,
  prefix: 'rl:qr:',
  message: 'Too many check-in attempts, please try again later',
});

module.exports = {
  createRateLimiter,
  defaultLimiter,
  authLimiter,
  qrCheckinLimiter,
};
