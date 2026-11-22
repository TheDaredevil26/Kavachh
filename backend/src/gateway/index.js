'use strict';

const app = require('./app');
const env = require('../config/env');
const logger = require('../utils/logger');
const { closeStreams } = require('./streams');
const { redis, redisSub } = require('../config/redis');
const prisma = require('../db/prisma');

const PORT = process.env.PORT || env.PORT || 8000;

let server;

if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info(`Kavach API Gateway listening on port ${PORT} [${env.NODE_ENV}]`);
    logger.info(`Interactive API Docs: http://localhost:${PORT}/api/docs`);
    logger.info(`Real-time Streams:    http://localhost:${PORT}/stream/{claims|worker|admin}`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    logger.info(`API Gateway received ${signal}, starting graceful shutdown…`);

    // 1. Close SSE hub and active stream connections
    try {
      await closeStreams();
      logger.info('All SSE connections closed');
    } catch (err) {
      logger.error('Error closing SSE streams', { error: err.message });
    }

    // 2. Close HTTP server
    if (server) {
      server.close(async () => {
        logger.info('HTTP server closed');

        // 3. Close Redis command and subscriber clients
        try {
          await Promise.allSettled([
            redis.quit(),
            redisSub.quit(),
          ]);
          logger.info('Redis clients disconnected');
        } catch (err) {
          logger.error('Error closing Redis clients', { error: err.message });
        }

        // 4. Disconnect Prisma database client
        try {
          await prisma.$disconnect();
          logger.info('Prisma disconnected');
        } catch (err) {
          logger.error('Error disconnecting Prisma', { error: err.message });
        }

        process.exit(0);
      });

      // Force exit if connections do not drain within 10 seconds
      const forceExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out after 10s, forcing exit');
        process.exit(1);
      }, 10000);

      if (typeof forceExitTimer.unref === 'function') {
        forceExitTimer.unref();
      }
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
module.exports.app = app;
