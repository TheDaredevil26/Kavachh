'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const routes = require('./routes');
const { attachRequestId, requestLogger } = require('../../middleware/requestLogger');
const { errorHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const env = require('../../config/env');
const { triggerWorker, setupRepeatableJobs } = require('./triggerService');

const app = express();

// Security and body parsing middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Structured logging & distributed tracing
app.use(attachRequestId);
app.use(requestLogger);

// Health check endpoints
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'trigger-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'trigger-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount application routes
app.use(routes);

// 404 Not Found handler
app.use((req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, `Cannot ${req.method} ${req.originalUrl}`));
});

// Centralized error handler
app.use(errorHandler);

const PORT = process.env.TRIGGER_PORT || process.env.TRIGGER_SERVICE_PORT || 8003;

let server;
if (require.main === module) {
  server = app.listen(PORT, async () => {
    logger.info(`Trigger Service listening on port ${PORT} [${env.NODE_ENV}]`);

    try {
      await setupRepeatableJobs();
    } catch (jobErr) {
      logger.error('Failed to register repeatable trigger jobs on startup', { error: jobErr.message });
    }
  });

  const shutdown = async () => {
    logger.info('Trigger Service shutting down…');

    try {
      if (triggerWorker) {
        await triggerWorker.close();
        logger.info('Trigger BullMQ worker closed successfully');
      }
    } catch (workerErr) {
      logger.error('Error closing Trigger BullMQ worker', { error: workerErr.message });
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
