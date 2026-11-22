'use strict';

const express = require('express');
const router = express.Router();

const controller = require('./controller');
const { authMiddleware } = require('../../middleware/auth');
const { authLimiter, qrCheckinLimiter } = require('../../middleware/rateLimiter');
const { AppError } = require('../../middleware/errorHandler');

const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  gpsUploadSchema,
  bankVerifySchema,
  qrCheckinSchema,
  updateProfileSchema,
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
 * Authentication Routes
 * ──────────────────────────────────────────────────────────── */

// POST /api/v1/auth/register — validate with registerSchema, find tenant by slug, hash password, encrypt PII, create worker, issue tokens
router.post('/api/v1/auth/register', authLimiter, validate(registerSchema), controller.register);
router.post('/auth/register', authLimiter, validate(registerSchema), controller.register);

// POST /api/v1/auth/login — validate with loginSchema, find worker by phone, bcrypt compare, issue tokens
router.post('/api/v1/auth/login', authLimiter, validate(loginSchema), controller.login);
router.post('/auth/login', authLimiter, validate(loginSchema), controller.login);

// POST /api/v1/auth/refresh — validate with refreshTokenSchema, call refreshToken from auth middleware
router.post('/api/v1/auth/refresh', validate(refreshTokenSchema), controller.refresh);
router.post('/auth/refresh', validate(refreshTokenSchema), controller.refresh);

// Platform OAuth PKCE linking routes
router.get('/api/v1/auth/platform/:tenantSlug/authorize', authMiddleware, controller.platformAuthorize);
router.get('/auth/platform/:tenantSlug/authorize', authMiddleware, controller.platformAuthorize);

router.get('/api/v1/auth/platform/:tenantSlug/callback', controller.platformCallback);
router.post('/api/v1/auth/platform/:tenantSlug/callback', controller.platformCallback);
router.get('/auth/platform/:tenantSlug/callback', controller.platformCallback);
router.post('/auth/platform/:tenantSlug/callback', controller.platformCallback);

/* ─────────────────────────────────────────────────────────────
 * Worker Profile Routes (Auth Required)
 * ──────────────────────────────────────────────────────────── */

// GET /api/v1/workers/me — auth required. Return worker profile (decrypt PII for display)
router.get('/api/v1/workers/me', authMiddleware, controller.getProfile);
router.get('/workers/me', authMiddleware, controller.getProfile);

// PUT /api/v1/workers/me — auth required. Update profile fields. Encrypt PII fields before save
router.put('/api/v1/workers/me', authMiddleware, validate(updateProfileSchema), controller.updateProfile);
router.put('/workers/me', authMiddleware, validate(updateProfileSchema), controller.updateProfile);

/* ─────────────────────────────────────────────────────────────
 * Worker Telemetry & Verification Routes (Auth Required)
 * ──────────────────────────────────────────────────────────── */

// POST /api/v1/workers/me/gps — auth required. Validate with gpsUploadSchema. Write to MongoDB gps_pings. Compute jitter.
router.post('/api/v1/workers/me/gps', authMiddleware, validate(gpsUploadSchema), controller.uploadGps);
router.post('/workers/me/gps', authMiddleware, validate(gpsUploadSchema), controller.uploadGps);

// POST /api/v1/workers/me/bank-verify — auth required. Validate with bankVerifySchema. Encrypt bank fields, set bank_verification_status='verified'.
router.post('/api/v1/workers/me/bank-verify', authMiddleware, validate(bankVerifySchema), controller.bankVerify);
router.post('/workers/me/bank-verify', authMiddleware, validate(bankVerifySchema), controller.bankVerify);

// POST /api/v1/workers/me/checkin/qr — auth required. Validate with qrCheckinSchema. Verify QR payload, tenant match, 150m geo, write MongoDB.
router.post('/api/v1/workers/me/checkin/qr', authMiddleware, qrCheckinLimiter, validate(qrCheckinSchema), controller.checkinQr);
router.post('/workers/me/checkin/qr', authMiddleware, qrCheckinLimiter, validate(qrCheckinSchema), controller.checkinQr);

/* ─────────────────────────────────────────────────────────────
 * Worker Notifications Route (Auth Required)
 * ──────────────────────────────────────────────────────────── */

// GET /api/v1/workers/me/notifications — auth required. Get notification log from Prisma.
router.get('/api/v1/workers/me/notifications', authMiddleware, controller.getNotifications);
router.get('/workers/me/notifications', authMiddleware, controller.getNotifications);

module.exports = router;
