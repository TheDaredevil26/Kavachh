'use strict';

const axios = require('axios');

const prisma = require('../../db/prisma');
const queues = require('../../config/queues');
const { cached } = require('../../cache/cached');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { getZoneCoordinates } = require('./triggerService');

/**
 * Generate synthetic 48-hour forecast slices for testing and offline development.
 *
 * @param {string} zoneId - Zone ID
 * @param {[number, number]} coordinates - [lat, lon]
 * @returns {object} Mock 16-slice forecast object (3-hour increments)
 */
function generateMockForecast(zoneId, coordinates) {
  const list = [];
  const now = Date.now();

  for (let i = 1; i <= 16; i++) {
    const timestamp = now + i * 3 * 3600 * 1000;
    const date = new Date(timestamp);
    const hour = date.getHours();

    // Simulate potential afternoon heat or evening monsoon rain in mock
    const isAfternoonHeat = hour >= 13 && hour <= 16;
    const isEveningRain = (i % 8 === 0) || (hour >= 18 && hour <= 21 && i < 6);

    list.push({
      dt: Math.floor(timestamp / 1000),
      main: {
        temp: isAfternoonHeat ? 41.5 : 31.0,
        feels_like: isAfternoonHeat ? 44.0 : 33.5,
        humidity: isEveningRain ? 88 : 55,
      },
      weather: [
        {
          id: isEveningRain ? 502 : 800,
          main: isEveningRain ? 'Rain' : 'Clear',
          description: isEveningRain ? 'heavy intensity rain' : 'clear sky',
        },
      ],
      pop: isEveningRain ? 0.75 : 0.15,
      rain: isEveningRain ? { '3h': 35.0 } : undefined,
    });
  }

  return {
    city: { name: zoneId, coord: { lat: coordinates[0], lon: coordinates[1] } },
    cnt: list.length,
    list,
  };
}

/**
 * Analyzes a 48-hour weather forecast for impending parametric trigger conditions.
 *
 * @param {object} forecast - OpenWeatherMap 5-day / 3-hour forecast response
 * @returns {Array<object>} Array of predicted trigger event windows
 */
function analyzeForecastForTriggers(forecast) {
  if (!forecast || !Array.isArray(forecast.list)) {
    return [];
  }

  const hazards = [];

  for (const slice of forecast.list) {
    const date = new Date(slice.dt * 1000);
    const dateString = date.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timeString = date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const windowStart = date.toISOString().slice(0, 13); // e.g. "2026-11-16T15"
    const windowLabel = `${dateString} around ${timeString}`;

    // 1. Rainfall evaluation
    const rain3h = slice.rain && slice.rain['3h'] ? Number(slice.rain['3h']) : 0;
    const pop = slice.pop !== undefined ? Number(slice.pop) : 0;
    const isHeavyRain = rain3h >= 25.0 || (pop >= 0.65 && slice.weather && slice.weather[0] && slice.weather[0].main === 'Rain');

    if (isHeavyRain) {
      hazards.push({
        type: 'rainfall',
        probability: Math.max(pop, 0.70),
        window: windowLabel,
        windowStart: `${windowStart}-rain`,
        estimatedPayoutMin: 200,
        estimatedPayoutMax: 500,
      });
    }

    // 2. Extreme heat evaluation
    const feelsLike = slice.main && slice.main.feels_like !== undefined ? Number(slice.main.feels_like) : 0;
    if (feelsLike >= 43.0) {
      hazards.push({
        type: 'heat',
        probability: 0.85,
        window: windowLabel,
        windowStart: `${windowStart}-heat`,
        estimatedPayoutMin: 200,
        estimatedPayoutMax: 500,
      });
    }
  }

  return hazards;
}

/**
 * Polls 48-hour weather forecasts for all active zones.
 * For hazards with probability >= 0.65, dispatches pre-alert notifications
 * to workers with active policies in that zone, deduplicated by BullMQ jobId.
 *
 * @returns {Promise<object>} Processing outcome
 */
async function pollWeatherForecast() {
  logger.info('Starting scheduled weather forecast polling (Pre-Alert Service)');

  let zones = [];
  try {
    const workerZones = await prisma.worker.findMany({
      distinct: ['zoneId'],
      select: { zoneId: true },
    });
    zones = workerZones.map((z) => z.zoneId);
  } catch (err) {
    logger.warn('Failed querying worker zones for forecast, fallback to dark stores', { error: err.message });
  }

  if (zones.length === 0) {
    try {
      const darkStoreZones = await prisma.darkStore.findMany({
        distinct: ['zoneId'],
        select: { zoneId: true },
      });
      zones = darkStoreZones.map((z) => z.zoneId);
    } catch (err) {
      logger.debug('Dark store zone query error', { error: err.message });
    }
  }

  if (zones.length === 0) {
    zones = ['delhi-central', 'mumbai-west', 'bangalore-east'];
  }

  let totalAlertsDispatched = 0;
  const processedZones = [];

  for (const zoneId of zones) {
    try {
      const [lat, lon] = await getZoneCoordinates(zoneId);

      // Cache-aside: key `forecast:{zoneId}`, 3-hour TTL (10800s)
      const forecast = await cached(`forecast:${zoneId}`, 3 * 3600, async () => {
        if (env.OWM_API_KEY) {
          try {
            const res = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
              params: {
                lat,
                lon,
                appid: env.OWM_API_KEY,
                units: 'metric',
                cnt: 16, // 16 * 3h = 48 hours
              },
              timeout: 8000,
            });
            return res.data;
          } catch (apiErr) {
            logger.warn('OWM forecast API call failed, using mock forecast', {
              zoneId,
              error: apiErr.message,
            });
            return generateMockForecast(zoneId, [lat, lon]);
          }
        }
        return generateMockForecast(zoneId, [lat, lon]);
      });

      const predictedHazards = analyzeForecastForTriggers(forecast);
      const significantHazards = predictedHazards.filter((p) => p.probability >= 0.65);

      let zoneAlerts = 0;

      for (const p of significantHazards) {
        // Query workers in this zone with active policies
        const holders = await prisma.worker.findMany({
          where: {
            zoneId,
            policies: {
              some: {
                isActive: true,
                status: 'active',
              },
            },
          },
          select: {
            id: true,
            tenantId: true,
            phoneNumber: true,
            name: true,
          },
        });

        if (holders.length > 0 && queues.notifications) {
          const notificationJobs = holders.map((w) => ({
            name: 'pre_alert',
            data: {
              workerId: w.id,
              tenantId: w.tenantId,
              type: 'pre_alert',
              message: `${p.type.toUpperCase()} forecast in your zone ${p.window}. You're covered. Estimated protection: ₹${p.estimatedPayoutMin}–₹${p.estimatedPayoutMax}.`,
              metadata: {
                zoneId,
                triggerType: p.type,
                probability: p.probability,
                window: p.window,
              },
            },
            opts: {
              jobId: `prealert:${w.id}:${p.type}:${p.windowStart}`, // Deduplicate alerts
              removeOnComplete: true,
            },
          }));

          await queues.notifications.addBulk(notificationJobs);
          zoneAlerts += holders.length;
          logger.info(`Dispatched ${holders.length} pre-alert notifications for ${p.type} in zone ${zoneId}`);
        }
      }

      totalAlertsDispatched += zoneAlerts;
      processedZones.push({
        zoneId,
        hazardsDetected: significantHazards.length,
        alertsSent: zoneAlerts,
      });
    } catch (zoneErr) {
      logger.error(`Error processing forecast for zone ${zoneId}`, { error: zoneErr.message });
      processedZones.push({ zoneId, error: zoneErr.message });
    }
  }

  logger.info(`Completed forecast polling. Dispatched ${totalAlertsDispatched} pre-alerts.`);
  return {
    totalZones: zones.length,
    totalAlertsDispatched,
    processedZones,
  };
}

module.exports = {
  pollWeatherForecast,
  analyzeForecastForTriggers,
  generateMockForecast,
};
