'use strict';

const express = require('express');
const router = express.Router();

const controller = require('./controller');
const { authMiddleware, requireRole } = require('../../middleware/auth');
const { simulateTriggerSchema } = require('../../utils/validators');
const { AppError } = require('../../middleware/errorHandler');

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
 * Public / Worker Trigger Information Routes (Auth Required)
 * NOTE: Specific route paths must precede parameterized /:id routes
 * ──────────────────────────────────────────────────────────── */

// GET /api/v1/triggers/active — auth required. Active, announced triggers for worker's zone.
// Cached for 5 minutes (TTL 300s) on key trigger:active:{zoneId}.
router.get('/api/v1/triggers/active', authMiddleware, controller.getActiveTriggers);
router.get('/triggers/active', authMiddleware, controller.getActiveTriggers);

// GET /api/v1/triggers/history — auth required. Last 30 days of triggers for worker's zone.
router.get('/api/v1/triggers/history', authMiddleware, controller.getTriggerHistory);
router.get('/triggers/history', authMiddleware, controller.getTriggerHistory);

// GET /api/v1/triggers/:id — auth required. Single trigger event by ID.
router.get('/api/v1/triggers/:id', authMiddleware, controller.getTriggerById);
router.get('/triggers/:id', authMiddleware, controller.getTriggerById);

/* ─────────────────────────────────────────────────────────────
 * Admin Trigger Simulation Routes (Admin Role Required)
 * ──────────────────────────────────────────────────────────── */

// POST /api/v1/admin/triggers/simulate — tenant_admin / super_admin only.
// Validate with simulateTriggerSchema. Creates trigger event directly and announces immediately.
router.post(
  '/api/v1/admin/triggers/simulate',
  authMiddleware,
  requireRole('tenant_admin', 'super_admin'),
  validate(simulateTriggerSchema),
  controller.simulateTrigger
);
router.post(
  '/admin/triggers/simulate',
  authMiddleware,
  requireRole('tenant_admin', 'super_admin'),
  validate(simulateTriggerSchema),
  controller.simulateTrigger
);

module.exports = router;
