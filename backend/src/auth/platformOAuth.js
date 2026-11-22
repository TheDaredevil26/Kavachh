'use strict';

const crypto = require('crypto');
const prisma = require('../db/prisma');
const { redis } = require('../config/redis');
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const STATE_PREFIX = 'oauth:platform:';
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * Generate OAuth 2.0 authorization URL with PKCE.
 * Creates state and PKCE code_verifier, stores them in Redis with 10 min TTL,
 * and returns the redirect URL to the mock platform.
 *
 * @param {string} tenantSlug - The slug of the tenant (e.g. 'blinkit')
 * @param {string} [workerId] - Optional ID of the worker initiating the link
 * @returns {Promise<string>} Redirect URL to the mock platform
 */
async function generateAuthorize(tenantSlug, workerId = null) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) {
    throw new AppError('TENANT_NOT_FOUND', 404, `Tenant '${tenantSlug}' not found`);
  }

  // Generate PKCE code_verifier and code_challenge (RFC 7636)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  // Generate cryptographic state parameter for CSRF mitigation
  const state = crypto.randomBytes(32).toString('hex');

  // Store state and verifier in Redis with 10 min TTL
  const stateKey = `${STATE_PREFIX}${state}`;
  const stateData = {
    tenantSlug,
    tenantId: tenant.id,
    code_verifier: codeVerifier,
    workerId: workerId || null,
    createdAt: Date.now(),
  };

  await redis.set(stateKey, JSON.stringify(stateData), 'EX', STATE_TTL_SECONDS);

  const redirectUri = `${env.OAUTH_REDIRECT_BASE}/api/v1/auth/platform/${tenantSlug}/callback`;
  const clientId = tenant.oauthClientId || tenantSlug;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authorizeUrl = `${env.MOCK_PLATFORM_OAUTH_URL}/authorize?${params.toString()}`;

  logger.info('OAuth authorize generated', { tenantSlug, state, workerId });

  return authorizeUrl;
}

/**
 * Handle OAuth callback from platform.
 * Verifies state from Redis, verifies code (mock: accepts any valid code),
 * and updates worker's platform_oauth_subject and platform_verified_at.
 *
 * @param {string} code - Authorization code from the platform
 * @param {string} state - State parameter returned by the platform
 * @param {string} [workerId] - Optional explicit worker ID
 * @returns {Promise<object>} Result containing worker_id, platform_oauth_subject, platform_verified_at
 */
async function handleCallback(code, state, workerId = null) {
  if (!state) {
    throw new AppError('INVALID_STATE', 400, 'State parameter is required');
  }

  const stateKey = `${STATE_PREFIX}${state}`;
  const storedRaw = await redis.get(stateKey);

  if (!storedRaw) {
    throw new AppError('INVALID_STATE', 400, 'Invalid or expired OAuth state');
  }

  // Delete state on use to prevent replay attacks
  await redis.del(stateKey);

  const stored = JSON.parse(storedRaw);

  if (!code) {
    throw new AppError('INVALID_CODE', 400, 'Missing authorization code');
  }

  // Mock OAuth 2.0 PKCE: accept any code and generate platform subject
  const platformOauthSubject = `mock-plat-sub-${stored.tenantSlug || 'worker'}-${code}`;
  const verifiedAt = new Date();

  const targetWorkerId = workerId || stored.workerId;
  let updatedWorker = null;

  if (targetWorkerId) {
    updatedWorker = await prisma.worker.update({
      where: { id: targetWorkerId },
      data: {
        platformOauthSubject,
        platformVerifiedAt: verifiedAt,
      },
    });
  } else {
    // If not passed in state or arguments, update first worker for this tenant
    const fallbackWorker = await prisma.worker.findFirst({
      where: { tenantId: stored.tenantId },
    });
    if (fallbackWorker) {
      updatedWorker = await prisma.worker.update({
        where: { id: fallbackWorker.id },
        data: {
          platformOauthSubject,
          platformVerifiedAt: verifiedAt,
        },
      });
    }
  }

  logger.info('OAuth callback processed', {
    tenantSlug: stored.tenantSlug,
    workerId: updatedWorker ? updatedWorker.id : null,
    platformOauthSubject,
  });

  return {
    success: true,
    worker_id: updatedWorker ? updatedWorker.id : null,
    platform_oauth_subject: platformOauthSubject,
    platform_verified_at: verifiedAt,
  };
}

module.exports = {
  generateAuthorize,
  handleCallback,
};
