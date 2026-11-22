'use strict';

const prisma = require('../../db/prisma');
const mockPlatformApi = require('./mockPlatformApi');
const { evaluateAndFireTrigger } = require('./triggerService');
const logger = require('../../utils/logger');

/**
 * Checks health of a dark store by evaluating recent order volume against historical averages.
 * If volume drop >= 75% over a 90-minute window, fires a tenant-scoped platform_outage trigger.
 *
 * @param {string} tenantId - Tenant UUID
 * @param {string} darkStoreId - Dark store identifier / UUID
 * @param {string} zoneId - Associated zone ID
 * @returns {Promise<object>} Outcome of health check
 */
async function checkDarkStoreHealth(tenantId, darkStoreId, zoneId) {
  logger.info('Evaluating dark store health for platform outage detection', {
    tenantId,
    darkStoreId,
    zoneId,
  });

  try {
    const currentVolume = await mockPlatformApi.getOrderVolume(tenantId, darkStoreId, '90min');
    const historicalAvg = await mockPlatformApi.getHistoricalOrderVolume(darkStoreId);

    if (!historicalAvg || historicalAvg <= 0) {
      logger.warn('Historical average volume is zero or unavailable, skipping check', { darkStoreId });
      return { outageDetected: false, dropPercentage: 0, currentVolume, historicalAvg };
    }

    const dropPercentage = 1 - currentVolume / historicalAvg;

    logger.debug('Dark store order volume evaluation', {
      darkStoreId,
      currentVolume,
      historicalAvg,
      dropPercentage: Number((dropPercentage * 100).toFixed(2)),
    });

    if (dropPercentage >= 0.75) {
      logger.warn('Platform outage detected: order volume dropped >= 75%', {
        tenantId,
        darkStoreId,
        zoneId,
        dropPercentage: Number((dropPercentage * 100).toFixed(2)),
        currentVolume,
        historicalAvg,
      });

      // Fire tenant-scoped platform_outage trigger
      const trigger = await evaluateAndFireTrigger(
        'platform_outage',
        zoneId,
        Number((dropPercentage * 100).toFixed(2)),
        {
          threshold: 75,
          unit: '%_volume_drop',
          minDurationMin: 90,
          dataSource: 'mock_platform_api',
        },
        tenantId
      );

      return {
        outageDetected: true,
        dropPercentage,
        currentVolume,
        historicalAvg,
        trigger,
      };
    }

    return {
      outageDetected: false,
      dropPercentage,
      currentVolume,
      historicalAvg,
    };
  } catch (err) {
    logger.error('Error during dark store health check', {
      tenantId,
      darkStoreId,
      zoneId,
      error: err.message,
    });
    return { outageDetected: false, error: err.message };
  }
}

/**
 * Sweeps all registered dark stores across tenants and evaluates their health.
 * Used by background BullMQ workers.
 *
 * @returns {Promise<object>} Summary of health check executions
 */
async function checkAllDarkStoresHealth() {
  try {
    const stores = await prisma.darkStore.findMany({
      select: {
        id: true,
        tenantId: true,
        zoneId: true,
        name: true,
      },
    });

    logger.info(`Checking health for ${stores.length} dark stores`);

    const results = [];
    for (const store of stores) {
      const outcome = await checkDarkStoreHealth(store.tenantId, store.id, store.zoneId);
      results.push({
        storeId: store.id,
        name: store.name,
        zoneId: store.zoneId,
        ...outcome,
      });
    }

    const outagesDetected = results.filter((r) => r.outageDetected).length;
    return {
      totalStoresChecked: stores.length,
      outagesDetected,
      results,
    };
  } catch (err) {
    logger.error('Failed sweeping dark stores for outage detection', { error: err.message });
    return { totalStoresChecked: 0, outagesDetected: 0, error: err.message };
  }
}

module.exports = {
  checkDarkStoreHealth,
  checkAllDarkStoresHealth,
};
