'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const requestIdMiddleware = require('../middleware/requestId');
const { requestLogger } = require('../middleware/requestLogger');
const { defaultLimiter } = require('../middleware/rateLimiter');
const { errorHandler, AppError } = require('../middleware/errorHandler');
const { register } = require('../middleware/metrics');
const { setupSwagger } = require('./swagger');
const router = require('./router');

const app = express();

// Security headers (contentSecurityPolicy disabled to allow Swagger UI scripts/styles)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Cross-Origin Resource Sharing
app.use(cors());

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request tracing and structured logging
app.use(requestIdMiddleware);
app.use(requestLogger);

// Global rate limiter (bypasses docs, health, and metrics endpoints)
app.use((req, res, next) => {
  if (
    req.path === '/health' ||
    req.path === '/api/v1/health' ||
    req.path === '/metrics' ||
    req.path.startsWith('/api/docs') ||
    process.env.NODE_ENV === 'test'
  ) {
    return next();
  }
  return defaultLimiter(req, res, next);
});

// Swagger interactive API documentation mounted at /api/docs and /api/docs.json
setupSwagger(app);

// Health check endpoints
app.get(['/health', '/api/v1/health'], (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Mount all service routes directly (worker, policy, claims, trigger, notifications, streams)
app.use(router);

// 404 Catch-all handler
app.use((req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, `Cannot ${req.method} ${req.originalUrl}`));
});

// Centralized application error handler
app.use(errorHandler);

module.exports = app;
