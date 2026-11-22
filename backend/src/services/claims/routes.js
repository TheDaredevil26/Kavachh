'use strict';

const express = require('express');
const router = express.Router();

const controller = require('./controller');
const { authMiddleware, requireRole } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');
const {
  fileClaimSchema,
  disputeSchema,
  adminReviewSchema,
  adminDisputeResolveSchema,
} = require('../../utils/validators');

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
 * Worker Claim Routes (Authenticated)
 * ──────────────────────────────────────────────────────────── */

// POST /api/v1/claims — File a claim against an announced trigger. Returns 202.
router.post('/api/v1/claims', authMiddleware, validate(fileClaimSchema), controller.fileClaim);
router.post('/claims', authMiddleware, validate(fileClaimSchema), controller.fileClaim);

// GET /api/v1/claims — List worker's claim history.
router.get('/api/v1/claims', authMiddleware, controller.listWorkerClaims);
router.get('/claims', authMiddleware, controller.listWorkerClaims);

// GET /api/v1/claims/:id/status — Lightweight status check (MUST be before /:id)
router.get('/api/v1/claims/:id/status', authMiddleware, controller.getClaimStatus);
router.get('/claims/:id/status', authMiddleware, controller.getClaimStatus);

// POST /api/v1/claims/:id/dispute — Dispute a paid claim within the 2-hour window.
router.post('/api/v1/claims/:id/dispute', authMiddleware, validate(disputeSchema), controller.disputeClaim);
router.post('/claims/:id/dispute', authMiddleware, validate(disputeSchema), controller.disputeClaim);

// GET /api/v1/claims/:id — Claim detail + state timeline.
router.get('/api/v1/claims/:id', authMiddleware, controller.getClaimById);
router.get('/claims/:id', authMiddleware, controller.getClaimById);

/* ─────────────────────────────────────────────────────────────
 * Admin Claim & Dispute Management Routes (Admin Role Required)
 * ──────────────────────────────────────────────────────────── */

// GET /api/v1/admin/claims/queue — Held claims ordered by review_priority DESC.
router.get('/api/v1/admin/claims/queue', authMiddleware, requireRole('admin'), controller.getAdminReviewQueue);
router.get('/admin/claims/queue', authMiddleware, requireRole('admin'), controller.getAdminReviewQueue);

// POST /api/v1/admin/claims/:id/review — Manual review decision (approve/reject/partial).
router.post('/api/v1/admin/claims/:id/review', authMiddleware, requireRole('admin'), validate(adminReviewSchema), controller.adminReviewClaim);
router.post('/admin/claims/:id/review', authMiddleware, requireRole('admin'), validate(adminReviewSchema), controller.adminReviewClaim);

// POST /api/v1/admin/disputes/:id/resolve — Resolve worker dispute (uphold/reject).
router.post('/api/v1/admin/disputes/:id/resolve', authMiddleware, requireRole('admin'), validate(adminDisputeResolveSchema), controller.adminResolveDispute);
router.post('/admin/disputes/:id/resolve', authMiddleware, requireRole('admin'), validate(adminDisputeResolveSchema), controller.adminResolveDispute);

// GET /api/v1/admin/analytics/tenant — Tenant analytics (claims, payouts, fraud rate).
router.get('/api/v1/admin/analytics/tenant', authMiddleware, requireRole('admin'), controller.getAdminTenantAnalytics);
router.get('/admin/analytics/tenant', authMiddleware, requireRole('admin'), controller.getAdminTenantAnalytics);

module.exports = router;
