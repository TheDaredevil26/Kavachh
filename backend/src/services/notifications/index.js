'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const routes = require('./routes');
const requestIdMiddleware = require('../../middleware/requestId');
const { requestLogger } = require('../../middleware/requestLogger');
const { errorHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const env = require('../../config/env');

// Start BullMQ notification worker
const { notificationWorker } = require('./notificationWorker');

const app = express();

// Security and utility middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Structured logging & distributed tracing
app.use(requestIdMiddleware);
app.use(requestLogger);

// Health check endpoints
app.get(['/health', '/api/v1/health'], (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'notification-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount notification routes
app.use(routes);

// 404 Not Found handler
app.use((req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, `Cannot ${req.method} ${req.originalUrl}`));
});

// Centralized error handler
app.use(errorHandler);

const PORT = process.env.NOTIFICATION_PORT || process.env.NOTIFICATION_SERVICE_PORT || 8005;

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info(`Notification Service listening on port ${PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async () => {
    logger.info('Notification Service shutting down…');
    try {
      if (notificationWorker) {
        await notificationWorker.close();
        logger.info('BullMQ notificationWorker closed');
      }
    } catch (err) {
      logger.error('Error closing notificationWorker', { error: err.message });
    }

    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
