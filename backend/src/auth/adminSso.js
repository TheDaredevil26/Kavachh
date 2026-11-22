'use strict';

const prisma = require('../db/prisma');
const { issueTokens } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { AuditEvent } = require('../db/mongo');
const logger = require('../utils/logger');

/**
 * Handle Google OIDC Admin SSO callback with domain-scoped authorization.
 *
 * Enforces:
 *   1. Tenant existence by slug
 *   2. ID token email verification
 *   3. Hosted domain (hd) matching email domain (blocks cross-domain spoofing)
 *   4. Domain check against tenant's allowedAdminDomains
 *   5. Admin registration and tenant assignment check
 *   6. Issues JWT tokens with role: admin.role
 *
 * @param {object} idToken - Decoded OIDC ID token payload (or mock object)
 * @param {string} tenantSlug - Tenant slug (e.g. 'blinkit', 'zepto', 'swiggy_instamart')
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function handleAdminCallback(idToken, tenantSlug) {
  if (!idToken || !idToken.email) {
    throw new AppError('INVALID_TOKEN', 400, 'Invalid ID token: missing email');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) {
    throw new AppError('TENANT_NOT_FOUND', 404, `Tenant '${tenantSlug}' not found`);
  }

  const email = idToken.email.toLowerCase().trim();
  const emailDomain = email.split('@')[1];

  if (!emailDomain) {
    throw new AppError('INVALID_TOKEN', 400, 'Invalid email format in ID token');
  }

  // Domain-scoped authorization: only the tenant's allow-listed domains may sign in as its admin.
  // hd (hosted domain) must match the email domain — blocks cross-domain impersonation.
  const isEmailVerified = idToken.email_verified !== false;
  const isHdValid = !idToken.hd || idToken.hd.toLowerCase() === emailDomain;
  const allowedDomains = (tenant.allowedAdminDomains || []).map((d) => d.toLowerCase());
  const isDomainAllowed = allowedDomains.includes(emailDomain);

  if (!isEmailVerified || !isHdValid || !isDomainAllowed) {
    try {
      await AuditEvent.create({
        actor_type: 'admin',
        actor_id: email,
        tenant_id: tenant.id,
        action: 'admin.login.denied',
        resource_type: 'admin_user',
        resource_id: email,
        metadata: {
          email,
          tenant: tenantSlug,
          reason: !isDomainAllowed ? 'domain_not_allowed' : (!isEmailVerified ? 'email_not_verified' : 'hd_mismatch'),
        },
        occurred_at: new Date(),
      });
    } catch (auditErr) {
      logger.warn('Failed to record admin login denied audit event', { error: auditErr.message });
    }

    throw new AppError(
      'DOMAIN_NOT_ALLOWED',
      403,
      `Email domain @${emailDomain} is not authorized for tenant '${tenantSlug}'`
    );
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (!admin || admin.tenantId !== tenant.id) {
    throw new AppError('ADMIN_NOT_REGISTERED', 403, 'Admin user not registered for this tenant');
  }

  // Update last login timestamp
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  try {
    await AuditEvent.create({
      actor_type: 'admin',
      actor_id: admin.id,
      tenant_id: tenant.id,
      action: 'admin.login.success',
      resource_type: 'admin_user',
      resource_id: admin.id,
      metadata: {
        email,
        tenant: tenantSlug,
        role: admin.role,
      },
      occurred_at: new Date(),
    });
  } catch (auditErr) {
    logger.warn('Failed to record admin login success audit event', { error: auditErr.message });
  }

  logger.info('Admin SSO login successful', { email, tenantSlug, role: admin.role });

  return issueTokens({
    sub: admin.id,
    tenant_id: tenant.id,
    role: admin.role,
  });
}

module.exports = {
  handleAdminCallback,
};
