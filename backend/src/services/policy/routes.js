'use strict';

const express = require('express');
const router = express.Router();

const controller = require('./controller');
const { authMiddleware } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');
const { buyPolicySchema } = require('../../utils/validators');

/**
 * Request validation middleware factory for Joi schemas.
 *
 * @param {import('joi').Schema} schema - Joi validation schema
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return next(new AppError('VALIDATION_ERROR', 400, details));
    }
    req.body = value;
    next();
  };
}

/* ─────────────────────────────────────────────────────────────
 * Static Tiers Information (NO Auth Required)
 * NOTE: Must be registered before /:id parameterized routes
 * ──────────────────────────────────────────────────────────── */

// GET /api/v1/policies/tiers — NO auth required. Static tier info. Cached for 24 hours.
router.get('/api/v1/policies/tiers', controller.getTiers);
router.get('/policies/tiers', controller.getTiers);

/* ─────────────────────────────────────────────────────────────
 * Policy Management Routes (Auth Required)
 * ──────────────────────────────────────────────────────────── */

// POST /api/v1/policies — auth required. Validate with buyPolicySchema.
// Checks platform_verified_at, calculates premium, creates policy + 5 trigger coverages.
// Returns 201 with policy details + waiting_period_ends_at.
router.post('/api/v1/policies', authMiddleware, validate(buyPolicySchema), controller.buyPolicy);
router.post('/policies', authMiddleware, validate(buyPolicySchema), controller.buyPolicy);

// GET /api/v1/policies — auth required. List worker's policies (tenant-scoped). Cached for 1 hour.
router.get('/api/v1/policies', authMiddleware, controller.listPolicies);
router.get('/policies', authMiddleware, controller.listPolicies);

// GET /api/v1/policies/:id/coverage — auth required. Coverage details per trigger type.
router.get('/api/v1/policies/:id/coverage', authMiddleware, controller.getPolicyCoverage);
router.get('/policies/:id/coverage', authMiddleware, controller.getPolicyCoverage);

// GET /api/v1/policies/:id — auth required. Get single policy with coverages.
router.get('/api/v1/policies/:id', authMiddleware, controller.getPolicyById);
router.get('/policies/:id', authMiddleware, controller.getPolicyById);

// DELETE /api/v1/policies/:id — auth required. Cancel policy & remove BullMQ renew job.
router.delete('/api/v1/policies/:id', authMiddleware, controller.cancelPolicy);
router.delete('/policies/:id', authMiddleware, controller.cancelPolicy);

module.exports = router;
