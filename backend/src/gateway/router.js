'use strict';

const express = require('express');
const router = express.Router();

// Direct service route imports
const workerRoutes = require('../services/worker/routes');
const policyRoutes = require('../services/policy/routes');
const claimsRoutes = require('../services/claims/routes');
const triggerRoutes = require('../services/trigger/routes');
const notificationRoutes = require('../services/notifications/routes');
const { router: streamRoutes } = require('./streams');
const { handleAdminCallback } = require('../auth/adminSso');

/**
 * Admin OIDC SSO endpoint for multi-tenant administration.
 * POST /api/v1/auth/admin/sso & /auth/admin/sso
 */
router.post(['/api/v1/auth/admin/sso', '/auth/admin/sso'], async (req, res, next) => {
  try {
    const { idToken, tenantSlug } = req.body;
    const tokens = await handleAdminCallback(idToken, tenantSlug);
    return res.status(200).json({
      success: true,
      data: tokens,
      error: null,
      meta: {
        request_id: req.id || req.requestId || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Root API discovery endpoint.
 */
router.get(['/api', '/api/v1'], (_req, res) => {
  res.status(200).json({
    name: 'Kavach Parametric Insurance Platform API',
    version: '1.0.0',
    documentation: '/api/docs',
    documentation_json: '/api/docs.json',
    health: '/health',
    metrics: '/metrics',
    status: 'operational',
  });
});

// Mount all service routes directly (no reverse proxy overhead)
router.use(workerRoutes);
router.use(policyRoutes);
router.use(claimsRoutes);
router.use(triggerRoutes);
router.use(notificationRoutes);
router.use(streamRoutes);

module.exports = router;
