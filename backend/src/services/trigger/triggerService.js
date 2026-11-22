'use strict';

const axios = require('axios');
const { Worker } = require('bullmq');

const prisma = require('../../db/prisma');
const queues = require('../../config/queues');
const { redis } = require('../../config/redis');
const { cached } = require('../../cache/cached');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { haversineDistance } = require('../../utils/geo');
const { GpsPing, DarkStoreCheckin, ProviderPayload } = require('../../db/mongo');

/**
 * Standard trigger thresholds defined in PRD Section 9.1
 */
const TRIGGER_THRESHOLDS = Object.freeze({
  rainfall: { field: 'rain_1h', threshold: 30, unit: 'mm/hr', minDurationMin: 45 },
  heat: { field: 'feels_like', threshold: 43, unit: '°C', minDurationMin: 60 },
  aqi: { field: 'aqi', threshold: 300, unit: 'AQI', minDurationMin: 90 },
});

/**
 * Zone geographical reference coordinates (fallback lookup table)
 */
const ZONE_COORDINATES_MAP = Object.freeze({
  'delhi-central': [28.6315, 77.2167],
  'delhi-south': [28.5244, 77.2065],
  'delhi-north': [28.7041, 77.1025],
  'delhi-east': [28.6280, 77.2950],
  'mumbai-west': [19.1136, 72.8697],
  'mumbai-south': [18.9220, 72.8347],
  'mumbai-central': [19.0178, 72.8478],
  'bangalore-east': [12.9716, 77.6412],
  'bangalore-south': [12.9250, 77.5938],
  'koramangala': [12.9352, 77.6245],
  'indiranagar': [12.9784, 77.6408],
  'hitec-city': [17.4435, 78.3772],
  'pune-west': [18.5204, 73.8567],
  'default': [28.6139, 77.2090], // New Delhi central
});

/**
 * Resolve [lat, lon] coordinates for a given zoneId.
 * Queries DarkStore table first, then fallback dictionary.
 *
 * @param {string} zoneId - Zone identifier
 * @returns {Promise<[number, number]>} [latitude, longitude]
 */
async function getZoneCoordinates(zoneId) {
  try {
    const store = await prisma.darkStore.findFirst({
      where: { zoneId },
      select: { latitude: true, longitude: true },
    });
    if (store && store.latitude && store.longitude) {
      return [Number(store.latitude), Number(store.longitude)];
    }
  } catch (err) {
    logger.debug('Error looking up zone coordinates in dark stores', { zoneId, error: err.message });
  }

  if (ZONE_COORDINATES_MAP[zoneId]) {
    return ZONE_COORDINATES_MAP[zoneId];
  }

  // Check prefix matches (e.g. 'delhi' matches 'delhi-central')
  for (const [key, coords] of Object.entries(ZONE_COORDINATES_MAP)) {
    if (zoneId.toLowerCase().includes(key) || key.includes(zoneId.toLowerCase())) {
      return coords;
    }
  }

  return ZONE_COORDINATES_MAP.default;
}

/**
 * Helper to query all active zones across registered dark stores and workers.
 *
 * @returns {Promise<string[]>} List of unique active zone IDs
 */
async function getActiveZones() {
  try {
    const darkStoreZones = await prisma.darkStore.findMany({
      distinct: ['zoneId'],
      select: { zoneId: true },
    });
    const workerZones = await prisma.worker.findMany({
      distinct: ['zoneId'],
      select: { zoneId: true },
    });

    const set = new Set([
      ...darkStoreZones.map((d) => d.zoneId),
      ...workerZones.map((w) => w.zoneId),
    ]);

    if (set.size > 0) {
      return Array.from(set);
    }
  } catch (err) {
    logger.warn('Could not query active zones from database, using defaults', { error: err.message });
  }

  return ['delhi-central', 'mumbai-west', 'bangalore-east'];
}

/**
 * Extract weather parameter value according to configured field path.
 *
 * @param {object} weather - OpenWeatherMap or mock weather object
 * @param {string} field - Field identifier ('rain_1h', 'feels_like', 'aqi', etc.)
 * @returns {number} Extracted numeric value
 */
function extractValue(weather, field) {
  if (!weather) return 0;

  if (field === 'rain_1h') {
    if (weather.rain && weather.rain['1h'] !== undefined) {
      return Number(weather.rain['1h']);
    }
    if (weather.rain && weather.rain['3h'] !== undefined) {
      return Number(weather.rain['3h']) / 3;
    }
    return Number(weather.rain_1h || 0);
  }

  if (field === 'feels_like') {
    if (weather.main && weather.main.feels_like !== undefined) {
      return Number(weather.main.feels_like);
    }
    if (weather.feels_like !== undefined) {
      return Number(weather.feels_like);
    }
    if (weather.main && weather.main.temp !== undefined) {
      return Number(weather.main.temp);
    }
    return 25.0;
  }

  if (field === 'aqi') {
    if (weather.aqi !== undefined) {
      return Number(weather.aqi);
    }
    if (weather.air_pollution && weather.air_pollution.list && weather.air_pollution.list[0]) {
      // Map OWM 1-5 index to India AQI scale (1: 50, 2: 100, 3: 200, 4: 300, 5: 450)
      const owmAqi = weather.air_pollution.list[0].main.aqi;
      const aqiMap = { 1: 45, 2: 95, 3: 180, 4: 280, 5: 390 };
      return aqiMap[owmAqi] || owmAqi * 70;
    }
    return 100;
  }

  return Number(weather[field] || 0);
}

/**
 * Generate synthetic realistic weather data for offline/mock environments.
 *
 * @param {string} zoneId - Zone ID
 * @param {[number, number]} coordinates - [lat, lon]
 * @returns {object} Mock OpenWeatherMap compatible payload
 */
function generateMockWeather(zoneId, coordinates) {
  return {
    coord: { lat: coordinates[0], lon: coordinates[1] },
    weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
    main: {
      temp: 32.0,
      feels_like: 34.5,
      temp_min: 28.0,
      temp_max: 36.0,
      pressure: 1008,
      humidity: 62,
    },
    rain: { '1h': 0 },
    rain_1h: 0,
    aqi: 145,
    wind: { speed: 3.2, deg: 180 },
    name: zoneId,
    dt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Formats a TriggerEvent row for API output and messaging.
 *
 * @param {object} trigger - TriggerEvent record
 * @returns {object}
 */
function formatTrigger(trigger) {
  if (!trigger) return null;
  return {
    id: trigger.id,
    trigger_event_id: trigger.id,
    tenant_id: trigger.tenantId || trigger.tenant_id || null,
    trigger_type: trigger.triggerType || trigger.trigger_type,
    zone_id: trigger.zoneId || trigger.zone_id,
    severity: trigger.severity || 'medium',
    threshold_value: trigger.thresholdValue !== null && trigger.thresholdValue !== undefined
      ? Number(trigger.thresholdValue)
      : null,
    actual_value: trigger.actualValue !== null && trigger.actualValue !== undefined
      ? Number(trigger.actualValue)
      : null,
    status: trigger.status || 'active',
    detected_at: trigger.detectedAt || trigger.detected_at,
    announced_at: trigger.announcedAt || trigger.announced_at,
    started_at: trigger.startedAt || trigger.started_at,
    ended_at: trigger.endedAt || trigger.ended_at,
    duration_minutes: trigger.durationMinutes || trigger.duration_minutes || null,
    data_source: trigger.dataSource || trigger.data_source || 'openweathermap',
    raw_data: trigger.rawData || trigger.raw_data || null,
    confirmed_at: trigger.confirmedAt || trigger.confirmed_at,
    created_at: trigger.createdAt || trigger.created_at,
    updated_at: trigger.updatedAt || trigger.updated_at,
  };
}

/**
 * Polls weather for a zone using cache-aside pattern (10 min TTL / 600s).
 * Protects OpenWeatherMap quota and checks configured trigger thresholds.
 *
 * @param {string} zoneId - Zone identifier
 * @returns {Promise<object>} Weather data and any triggered events
 */
async function pollWeatherForZone(zoneId) {
  const cacheKey = `weather:${zoneId}`;

  // Cache-aside weather fetch (TTL 600s)
  const weather = await cached(cacheKey, 600, async () => {
    const [lat, lon] = await getZoneCoordinates(zoneId);

    // If API key is present, attempt real fetch; otherwise return mock
    if (env.OWM_API_KEY) {
      try {
        const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
          params: { lat, lon, appid: env.OWM_API_KEY, units: 'metric' },
          timeout: 6000,
        });

        // Best effort: archive provider payload in MongoDB
        try {
          await ProviderPayload.create({
            provider: 'openweathermap',
            tenant_id: 'system',
            event_type: 'weather_poll',
            raw_payload: res.data,
            received_at: new Date(),
          });
        } catch (mongoErr) {
          logger.debug('Failed to archive OWM payload to MongoDB', { error: mongoErr.message });
        }

        return res.data;
      } catch (axiosErr) {
        logger.warn('OWM API call failed, falling back to mock weather data', {
          zoneId,
          error: axiosErr.message,
        });
        return generateMockWeather(zoneId, [lat, lon]);
      }
    } else {
      logger.debug('No OWM_API_KEY configured, using mock weather', { zoneId });
      return generateMockWeather(zoneId, [lat, lon]);
    }
  });

  // Evaluate each parametric threshold against the weather data
  const firedTriggers = [];
  for (const [type, cfg] of Object.entries(TRIGGER_THRESHOLDS)) {
    const actual = extractValue(weather, cfg.field);
    if (actual >= cfg.threshold) {
      logger.info('Parametric threshold exceeded', {
        zoneId,
        type,
        actual,
        threshold: cfg.threshold,
        unit: cfg.unit,
      });
      const trigger = await evaluateAndFireTrigger(type, zoneId, actual, cfg, null);
      if (trigger) {
        firedTriggers.push(trigger);
      }
    }
  }

  return { weather, firedTriggers };
}

/**
 * T=0 Silent Presence Snapshot (Layer F).
 * Queries MongoDB gps_pings and recent dark store QR check-ins for workers
 * present in the zone before anyone could know a trigger exists.
 *
 * @param {object} trigger - TriggerEvent instance
 * @returns {Promise<string[]>} Array of worker IDs verified present at T=0
 */
async function snapshotPresence(trigger) {
  const detectedTime = new Date(trigger.detectedAt || Date.now()).getTime();
  const windowStart = new Date(detectedTime - 60 * 60 * 1000); // 60 minutes prior
  const windowEnd = new Date(detectedTime);

  logger.info('Recording T=0 silent presence snapshot for trigger', {
    triggerId: trigger.id,
    zoneId: trigger.zoneId,
    detectedAt: trigger.detectedAt,
  });

  const presentWorkerIds = new Set();

  // 1. Query DarkStoreCheckin in MongoDB (Section 5.2 / 7.1)
  try {
    const darkStores = await prisma.darkStore.findMany({
      where: { zoneId: trigger.zoneId },
      select: { id: true },
    });
    const storeIds = darkStores.map((s) => s.id);

    const checkinQuery = {
      checked_in_at: { $gte: windowStart, $lte: windowEnd },
      verified: true,
    };
    if (storeIds.length > 0) {
      checkinQuery.dark_store_id = { $in: storeIds };
    }

    const checkins = await DarkStoreCheckin.find(checkinQuery).select('worker_id');
    for (const c of checkins) {
      if (c.worker_id) presentWorkerIds.add(String(c.worker_id));
    }
  } catch (mongoErr) {
    logger.warn('Failed querying dark store check-ins for snapshot', { error: mongoErr.message });
  }

  // 2. Query GpsPing in MongoDB within 60 minutes
  try {
    const [zoneLat, zoneLon] = await getZoneCoordinates(trigger.zoneId);

    const pings = await GpsPing.find({
      recorded_at: { $gte: windowStart, $lte: windowEnd },
    }).select('worker_id location');

    for (const ping of pings) {
      if (ping.worker_id) {
        if (ping.location && Array.isArray(ping.location.coordinates)) {
          const [lng, lat] = ping.location.coordinates;
          const distKm = haversineDistance(zoneLat, zoneLon, lat, lng);
          if (distKm <= 8.0) { // within 8 km of zone centroid
            presentWorkerIds.add(String(ping.worker_id));
          }
        } else {
          presentWorkerIds.add(String(ping.worker_id));
        }
      }
    }
  } catch (mongoErr) {
    logger.warn('Failed querying GPS pings for snapshot', { error: mongoErr.message });
  }

  // 3. Fallback: also ensure active workers registered in this zone are accounted for
  try {
    const workersInZone = await prisma.worker.findMany({
      where: { zoneId: trigger.zoneId, status: 'active' },
      select: { id: true },
    });
    for (const w of workersInZone) {
      presentWorkerIds.add(w.id);
    }
  } catch (dbErr) {
    logger.debug('Worker lookup fallback error', { error: dbErr.message });
  }

  const workerIdArray = Array.from(presentWorkerIds);

  // 4. Save to Redis set for ultra-fast Layer F verification (TTL: 7 days)
  try {
    if (workerIdArray.length > 0) {
      const redisKey = `trigger:presence:${trigger.id}`;
      await redis.sadd(redisKey, ...workerIdArray);
      await redis.expire(redisKey, 7 * 86400);
    }
  } catch (redisErr) {
    logger.warn('Failed to store presence snapshot in Redis', { error: redisErr.message });
  }

  // 5. Update TriggerEvent rawData in PostgreSQL with snapshot audit metadata
  try {
    const currentRaw = (trigger.rawData && typeof trigger.rawData === 'object') ? trigger.rawData : {};
    await prisma.triggerEvent.update({
      where: { id: trigger.id },
      data: {
        rawData: {
          ...currentRaw,
          presenceSnapshot: {
            snapshotTime: new Date(detectedTime).toISOString(),
            totalWorkersPresent: workerIdArray.length,
            workerIds: workerIdArray,
          },
        },
      },
    });
  } catch (dbErr) {
    logger.warn('Failed to persist presence snapshot to trigger event record', { error: dbErr.message });
  }

  logger.info(`Recorded ${workerIdArray.length} workers in T=0 presence snapshot for trigger ${trigger.id}`);
  return workerIdArray;
}

/**
 * Creates and fires a parametric trigger event with an 8-minute temporal decoupling delay.
 *
 * @param {string} type - Trigger type ('rainfall' | 'heat' | 'aqi' | 'curfew' | 'platform_outage')
 * @param {string} zoneId - Affected zone identifier
 * @param {number} actual - Actual measured value
 * @param {object} cfg - Threshold configuration
 * @param {string|null} [tenantId=null] - Tenant ID (null for platform-wide triggers)
 * @returns {Promise<object|null>} The created TriggerEvent or existing one
 */
async function evaluateAndFireTrigger(type, zoneId, actual, cfg, tenantId = null) {
  const detectedAt = new Date();
  const announceAt = new Date(detectedAt.getTime() + 8 * 60 * 1000); // T+8 minutes

  const severity = actual >= (cfg.threshold * 1.5) ? 'high' : 'medium';

  // Check if an active trigger already exists for this zone and type
  const existingActive = await prisma.triggerEvent.findFirst({
    where: {
      zoneId,
      triggerType: type,
      tenantId: tenantId || null,
      status: 'active',
    },
  });

  if (existingActive) {
    logger.info('Active trigger event already exists for zone', {
      zoneId,
      type,
      existingId: existingActive.id,
    });
    return existingActive;
  }

  let trigger;
  try {
    trigger = await prisma.triggerEvent.create({
      data: {
        triggerType: type,
        zoneId,
        tenantId: tenantId || null,
        actualValue: actual,
        thresholdValue: cfg.threshold,
        severity,
        detectedAt,
        announcedAt: announceAt,
        status: 'active',
        dataSource: cfg.dataSource || 'openweathermap',
        rawData: {
          unit: cfg.unit || '',
          minDurationMin: cfg.minDurationMin || 0,
        },
      },
    });

    logger.info('Created new trigger event (T=0 detected, announce at T+8m)', {
      triggerId: trigger.id,
      type,
      zoneId,
      announcedAt: announceAt,
    });
  } catch (err) {
    // Unique violation check (P2002) in case of concurrent poller executions
    if (err.code === 'P2002' || (err.message && err.message.includes('unique constraint'))) {
      logger.info('Trigger event creation collided with existing active trigger', { zoneId, type });
      return null;
    }
    throw err;
  }

  // T=0 silent presence snapshot (Layer F)
  try {
    await snapshotPresence(trigger);
  } catch (snapErr) {
    logger.error('Failed to capture presence snapshot at T=0', {
      triggerId: trigger.id,
      error: snapErr.message,
    });
  }

  // Enqueue delayed announce-trigger BullMQ job (8 minutes delay = 480,000 ms)
  const triggerQueue = queues['trigger'];
  if (triggerQueue) {
    try {
      await triggerQueue.add(
        'announce-trigger',
        {
          triggerId: trigger.id,
          zoneId: trigger.zoneId,
          triggerType: trigger.triggerType,
        },
        {
          delay: 8 * 60 * 1000,
          jobId: `announce:${trigger.id}`,
          removeOnComplete: true,
        }
      );
      logger.info(`Enqueued delayed announce-trigger job (8m delay) for trigger ${trigger.id}`);
    } catch (queueErr) {
      logger.error('Failed to enqueue announce-trigger BullMQ job', {
        triggerId: trigger.id,
        error: queueErr.message,
      });
    }
  }

  return trigger;
}

/**
 * BullMQ Worker for the 'trigger' queue.
 * Processes jobs: 'poll-weather', 'announce-trigger', 'poll-forecast'.
 */
const triggerWorker = new Worker(
  'trigger',
  async (job) => {
    logger.info(`Trigger worker received job "${job.name}" [id: ${job.id}]`);

    // 1. Announce trigger (after 8-min delay)
    if (job.name === 'announce-trigger') {
      const { triggerId } = job.data;
      const trigger = await prisma.triggerEvent.findUnique({
        where: { id: triggerId },
      });

      if (!trigger) {
        logger.warn(`Trigger not found for announcement: ${triggerId}`);
        return { success: false, reason: 'NOT_FOUND' };
      }

      // Format trigger event
      const formatted = formatTrigger(trigger);

      // Write-through cache with 5-minute TTL (300 seconds)
      const cacheKey = `trigger:active:${trigger.zoneId}`;
      await redis.set(cacheKey, JSON.stringify([formatted]), 'EX', 300);

      // Publish event on Redis pub/sub channel
      await redis.publish('evt:trigger.announced', JSON.stringify(formatted));

      logger.info('Published evt:trigger.announced to clients and SSE hub', {
        triggerId: trigger.id,
        zoneId: trigger.zoneId,
      });

      return { success: true, triggerId: trigger.id };
    }

    // 2. Poll weather for all active zones
    if (job.name === 'poll-weather') {
      const zones = await getActiveZones();
      logger.info(`Running scheduled weather poll for ${zones.length} zones`, { zones });

      const results = [];
      for (const zoneId of zones) {
        try {
          const outcome = await pollWeatherForZone(zoneId);
          results.push({ zoneId, success: true, triggersFired: outcome.firedTriggers.length });
        } catch (err) {
          logger.error(`Error polling weather for zone ${zoneId}`, { error: err.message });
          results.push({ zoneId, success: false, error: err.message });
        }
      }

      return { totalZones: zones.length, results };
    }

    // 3. Poll weather forecast (pre-alert system)
    if (job.name === 'poll-forecast') {
      const { pollWeatherForecast } = require('./preAlertService');
      return await pollWeatherForecast();
    }

    // 4. Dark store outage health check
    if (job.name === 'check-outages') {
      const { checkAllDarkStoresHealth } = require('./outageDetector');
      return await checkAllDarkStoresHealth();
    }

    logger.warn(`Unrecognized job name: ${job.name}`);
    return { success: false, reason: 'UNKNOWN_JOB' };
  },
  {
    connection: { host: redis.options.host, port: redis.options.port },
    concurrency: 5,
  }
);

triggerWorker.on('completed', (job, result) => {
  logger.info(`Trigger job ${job.name} (id: ${job.id}) completed successfully`, { result });
});

triggerWorker.on('failed', (job, err) => {
  logger.error(`Trigger job ${job ? job.name : 'unknown'} failed`, {
    jobId: job ? job.id : 'unknown',
    error: err.message,
  });
});

triggerWorker.on('error', (err) => {
  logger.error('Trigger worker connection error', { error: err.message });
});

/**
 * Register repeatable background jobs for the Trigger Service:
 * - poll-weather every 30 minutes
 * - poll-forecast every 3 hours
 */
async function setupRepeatableJobs() {
  const triggerQueue = queues['trigger'];
  if (!triggerQueue) {
    logger.warn('Trigger queue unavailable, cannot register repeatable jobs');
    return;
  }

  try {
    // 1. Repeatable poll-weather: every 30 minutes (30 * 60 * 1000 = 1,800,000 ms)
    await triggerQueue.add(
      'poll-weather',
      {},
      {
        repeat: { every: 30 * 60 * 1000 },
        jobId: 'poll-weather-repeatable',
        removeOnComplete: true,
      }
    );

    // 2. Repeatable poll-forecast: every 3 hours (3 * 60 * 60 * 1000 = 10,800,000 ms)
    await triggerQueue.add(
      'poll-forecast',
      {},
      {
        repeat: { every: 3 * 60 * 60 * 1000 },
        jobId: 'poll-forecast-repeatable',
        removeOnComplete: true,
      }
    );

    logger.info('Registered repeatable jobs for Trigger Service: poll-weather (30m), poll-forecast (3h)');
  } catch (err) {
    logger.error('Failed to register repeatable trigger jobs', { error: err.message });
  }
}

module.exports = {
  TRIGGER_THRESHOLDS,
  ZONE_COORDINATES_MAP,
  getZoneCoordinates,
  getActiveZones,
  extractValue,
  formatTrigger,
  pollWeatherForZone,
  snapshotPresence,
  evaluateAndFireTrigger,
  triggerWorker,
  setupRepeatableJobs,
};
