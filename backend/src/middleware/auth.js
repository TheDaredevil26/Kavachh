'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { redis } = require('../config/redis');
const env = require('../config/env');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

const REFRESH_PREFIX = 'refresh:';

/**
 * Middleware: verify JWT from Authorization Bearer header, set req.auth.
 */
function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 401, 'Missing or invalid Authorization header'));
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    req.auth = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('TOKEN_EXPIRED', 401, 'Access token has expired'));
    }
    return next(new AppError('UNAUTHORIZED', 401, 'Invalid access token'));
  }
}

/**
 * Middleware factory: restrict access to specific roles.
 *
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'worker')
 * @returns {Function} Express middleware
 */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
    }
    if (!roles.includes(req.auth.role)) {
      return next(new AppError('FORBIDDEN', 403, `Requires one of roles: ${roles.join(', ')}`));
    }
    next();
  };
}

/**
 * Issue a JWT access token and a random refresh token.
 *
 * @param {object} claims - Payload claims (sub, role, tenant_id, etc.)
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function issueTokens(claims) {
  const accessToken = jwt.sign(claims, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });

  const refreshToken = crypto.randomBytes(48).toString('hex');
  const refreshTtlSeconds = env.REFRESH_TTL_DAYS * 86400;

  // Store refresh token in Redis with the associated claims
  const key = `${REFRESH_PREFIX}${refreshToken}`;
  await redis.set(key, JSON.stringify(claims), 'EX', refreshTtlSeconds);

  logger.info('Tokens issued', { sub: claims.sub, role: claims.role });

  return { accessToken, refreshToken };
}

/**
 * Validate a refresh token, rotate it, and issue a new pair.
 *
 * @param {string} token - The refresh token to validate
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 * @throws {AppError} If the refresh token is invalid or expired
 */
async function refreshTokenFn(token) {
  const key = `${REFRESH_PREFIX}${token}`;
  const stored = await redis.get(key);

  if (!stored) {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh token is invalid or expired');
  }

  // Delete the old token (rotation — single use)
  await redis.del(key);

  const claims = JSON.parse(stored);

  // Issue a fresh pair
  return issueTokens(claims);
}

/**
 * Revoke a refresh token (e.g., on logout).
 *
 * @param {string} token - The refresh token to revoke
 */
async function revokeRefreshToken(token) {
  const key = `${REFRESH_PREFIX}${token}`;
  await redis.del(key);
  logger.info('Refresh token revoked');
}

module.exports = {
  authMiddleware,
  requireRole,
  issueTokens,
  refreshToken: refreshTokenFn,
  revokeRefreshToken,
};
