'use strict';

const express = require('express');
const router = express.Router();

const controller = require('./controller');
const { authMiddleware, requireRole } = require('../../middleware/auth');

/* ─────────────────────────────────────────────────────────────
 * Notification Routes
 * ──────────────────────────────────────────────────────────── */

// POST /api/v1/notifications/send & /notifications/send
router.post(
  ['/api/v1/notifications/send', '/notifications/send'],
  authMiddleware,
  controller.sendNotification
);

// GET /api/v1/notifications & /notifications
router.get(
  ['/api/v1/notifications', '/notifications'],
  authMiddleware,
  controller.listNotifications
);

// GET /api/v1/notifications/worker/:workerId & /notifications/worker/:workerId
router.get(
  ['/api/v1/notifications/worker/:workerId', '/notifications/worker/:workerId'],
  authMiddleware,
  controller.getWorkerNotifications
);

module.exports = router;
