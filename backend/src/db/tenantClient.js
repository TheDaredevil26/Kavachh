'use strict';

const prisma = require('./prisma');

/**
 * Models that are tenant-scoped and require tenant_id injection.
 */
const TENANT_MODELS = new Set([
  'worker',
  'policy',
  'policyCoverage',
  'claim',
  'claimStateTransition',
  'claimDispute',
  'fraudSignal',
  'payout',
  'darkStore',
  'triggerEvent',
  'notificationLog',
]);

/**
 * Returns a Prisma client extension that automatically injects tenant_id
 * into all queries for tenant-owned models.
 *
 * @param {string} tenantId - UUID of the tenant
 * @returns {import('@prisma/client').PrismaClient} Extended Prisma client
 */
function forTenant(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for forTenant()');
  }

  return prisma.$extends({
    name: `tenant-${tenantId}`,
    query: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_MODELS.has(model)) {
          return query(args);
        }

        // Read operations: inject tenant_id into where clause
        if (['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
          args.where = { ...args.where, tenant_id: tenantId };
          return query(args);
        }

        // Create operations: inject tenant_id into data
        if (operation === 'create') {
          args.data = { ...args.data, tenant_id: tenantId };
          return query(args);
        }

        if (operation === 'createMany') {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) => ({ ...d, tenant_id: tenantId }));
          } else {
            args.data = { ...args.data, tenant_id: tenantId };
          }
          return query(args);
        }

        // Update operations: inject tenant_id into where and data
        if (['update', 'updateMany'].includes(operation)) {
          args.where = { ...args.where, tenant_id: tenantId };
          return query(args);
        }

        // Upsert operations
        if (operation === 'upsert') {
          args.where = { ...args.where, tenant_id: tenantId };
          args.create = { ...args.create, tenant_id: tenantId };
          return query(args);
        }

        // Delete operations: inject tenant_id into where
        if (['delete', 'deleteMany'].includes(operation)) {
          args.where = { ...args.where, tenant_id: tenantId };
          return query(args);
        }

        return query(args);
      },
    },
  });
}

module.exports = { forTenant, TENANT_MODELS };
