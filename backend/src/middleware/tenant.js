'use strict';

const prisma = require('../db/prisma');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

/**
 * Middleware: reads tenant_id from the JWT (req.auth) and attaches req.tenantId.
 * For admin users, also sets the PostgreSQL session variable `app.tenant_id`
 * so that Row-Level Security (RLS) policies can use it.
 */
async function tenantMiddleware(req, _res, next) {
  try {
    if (!req.auth) {
      return next(new AppError('UNAUTHORIZED', 401, 'Authentication required for tenant resolution'));
    }

    const tenantId = req.auth.tenant_id;

    if (!tenantId) {
      return next(new AppError('TENANT_MISSING', 400, 'tenant_id is missing from the token'));
    }

    req.tenantId = tenantId;

    // For admin requests, set the PostgreSQL session variable for RLS
    if (req.auth.role === 'admin') {
      try {
        await prisma.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
      } catch (err) {
        logger.warn('Failed to set RLS session variable', {
          tenant_id: tenantId,
          error: err.message,
        });
        // Non-fatal — the Prisma extension still filters by tenant_id
      }
    }

    logger.debug('Tenant resolved', { tenant_id: tenantId, role: req.auth.role });
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantMiddleware };
