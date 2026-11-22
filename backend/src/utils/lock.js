'use strict';

const crypto = require('crypto');
const { redis } = require('../config/redis');
const logger = require('./logger');

/**
 * Lua script to release a lock only if the current holder owns it.
 * Prevents releasing a lock acquired by a different process after expiry.
 */
const RELEASE_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/**
 * Acquire a Redis distributed lock, execute fn, then release.
 *
 * @param {string} key      - The lock key (e.g., "lock:claim:uuid")
 * @param {number} ttlMs    - Maximum lock hold time in milliseconds
 * @param {Function} fn     - Async function to execute while holding the lock
 * @returns {*} Result of fn
 * @throws {Error} If the lock cannot be acquired
 */
async function withRedisLock(key, ttlMs, fn) {
  const lockValue = crypto.randomUUID();
  const lockKey = `lock:${key}`;

  const acquired = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');

  if (!acquired) {
    const err = new Error(`Could not acquire lock: ${lockKey}`);
    err.code = 'LOCK_NOT_ACQUIRED';
    logger.warn('Lock acquisition failed', { lockKey, ttlMs });
    throw err;
  }

  try {
    const result = await fn();
    return result;
  } finally {
    try {
      await redis.eval(RELEASE_LUA, 1, lockKey, lockValue);
    } catch (releaseErr) {
      logger.error('Failed to release lock', { lockKey, error: releaseErr.message });
    }
  }
}

module.exports = { withRedisLock };
