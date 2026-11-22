'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const routes = require('./routes');
const { attachRequestId, requestLogger } = require('../../middleware/requestLogger');
const { errorHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const env = require('../../config/env');

// Load workers so BullMQ listeners are registered
const { validationWorker, fraudWorker } = require('./workers');
const payoutWorker = require('./payoutWorker');
const closeWorker = require('./closeWorker');

const app = express();

// Security and body parsing middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Structured logging & tracing
app.use(attachRequestId);
app.use(requestLogger);

// Health check endpoints
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'claims-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'claims-service',
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

const PORT = process.env.CLAIMS_PORT || process.env.CLAIMS_SERVICE_PORT || 8004;

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info(`Claims Service listening on port ${PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async () => {
    logger.info('Claims Service shutting down…');
    try {
      await Promise.allSettled([
        validationWorker.close(),
        fraudWorker.close(),
        payoutWorker.close(),
        closeWorker.close(),
      ]);
      logger.info('All claims BullMQ workers closed');
    } catch (err) {
      logger.error('Error closing BullMQ workers', { error: err.message });
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
