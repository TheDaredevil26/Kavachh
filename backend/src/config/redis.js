'use strict';

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

const redisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
};

/** Primary Redis client for commands (GET, SET, etc.) */
const redis = new Redis(redisOptions);

/** Dedicated subscriber client (cannot mix SUBSCRIBE with regular commands) */
const redisSub = new Redis(redisOptions);

redis.on('connect', () => logger.info('Redis command client connected'));
redis.on('error', (err) => logger.error('Redis command client error', { error: err.message }));

redisSub.on('connect', () => logger.info('Redis subscriber client connected'));
redisSub.on('error', (err) => logger.error('Redis subscriber client error', { error: err.message }));

module.exports = { redis, redisSub };
