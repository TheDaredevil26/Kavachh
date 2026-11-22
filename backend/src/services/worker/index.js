'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const routes = require('./routes');
const { attachRequestId, requestLogger } = require('../../middleware/requestLogger');
const { errorHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const env = require('../../config/env');

const app = express();

// Security and utility middleware
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
    service: 'worker-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'worker-service',
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

const PORT = process.env.WORKER_PORT || process.env.WORKER_SERVICE_PORT || 8001;

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info(`Worker Service listening on port ${PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = () => {
    logger.info('Worker Service shutting down…');
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
