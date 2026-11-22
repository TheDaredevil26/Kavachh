'use strict';

const { redis } = require('../config/redis');
const { withRedisLock } = require('../utils/lock');
const { metrics } = require('../middleware/metrics');
const logger = require('../utils/logger');

/**
 * In-process single-flight map to coalesce concurrent calls for the same key
 * within a single Node process.
 */
const inflightMap = new Map();

/**
 * Add TTL jitter of ±10% to prevent cache stampedes from synchronized expiry.
 *
 * @param {number} ttlSec - Base TTL in seconds
 * @returns {number} Jittered TTL in seconds
 */
function jitterTtl(ttlSec) {
  const jitter = ttlSec * 0.1;
  return Math.round(ttlSec + (Math.random() * 2 - 1) * jitter);
}

/**
 * Cache-aside helper with stampede protection.
 *
 * Features:
 * - In-process single-flight: concurrent calls to the same key within one process
 *   share a single loader invocation.
 * - Cross-process stampede guard: a Redis distributed lock ensures only one
 *   process runs the loader on a cache miss.
 * - TTL jitter: ±10% randomisation to avoid synchronised expiry.
 * - Negative caching: null/undefined loader results are cached for 30 seconds.
 *
 * @param {string}   key       - Cache key
 * @param {number}   ttlSec    - Base TTL in seconds
 * @param {Function} loader    - Async function that loads the data on miss
 * @returns {Promise<*>}       - Cached or freshly-loaded value
 */
async function cached(key, ttlSec, loader) {
  const keyPrefix = key.split(':')[0] || 'default';

  // 1. Try cache hit
  const hit = await redis.get(key);
  if (hit !== null) {
    metrics.cacheHits.inc({ cache_key_prefix: keyPrefix });
    const parsed = JSON.parse(hit);
    // Distinguish null value from missing key
    return parsed && parsed.__null ? null : parsed;
  }

  metrics.cacheMisses.inc({ cache_key_prefix: keyPrefix });

  // 2. In-process single-flight
  if (inflightMap.has(key)) {
    return inflightMap.get(key);
  }

  const loadPromise = (async () => {
    try {
      // 3. Cross-process stampede guard
      const result = await withRedisLock(`cache-load:${key}`, 10000, async () => {
        // Double-check cache after acquiring lock (another process may have populated it)
        const recheck = await redis.get(key);
        if (recheck !== null) {
          metrics.cacheHits.inc({ cache_key_prefix: keyPrefix });
          const parsed = JSON.parse(recheck);
          return parsed && parsed.__null ? null : parsed;
        }

        // 4. Run loader
        const value = await loader();

        // 5. Cache the result
        if (value === null || value === undefined) {
          // Negative cache for 30 seconds
          await redis.set(key, JSON.stringify({ __null: true }), 'EX', 30);
        } else {
          const ttl = jitterTtl(ttlSec);
          await redis.set(key, JSON.stringify(value), 'EX', ttl);
        }

        return value;
      });

      return result;
    } catch (err) {
      if (err.code === 'LOCK_NOT_ACQUIRED') {
        metrics.lockContention.inc({ lock_key_prefix: `cache-load:${keyPrefix}` });
        logger.debug('Cache stampede lock contention, falling back to loader', { key });
        // Fallback: run the loader without lock (better than returning nothing)
        return loader();
      }
      throw err;
    } finally {
      inflightMap.delete(key);
    }
  })();

  inflightMap.set(key, loadPromise);

  return loadPromise;
}

module.exports = { cached };
