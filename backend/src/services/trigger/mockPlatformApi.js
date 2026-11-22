'use strict';

const logger = require('../../utils/logger');

/**
 * In-memory store for simulated dark store volume drops.
 * Key: darkStoreId -> Value: dropPercentage (e.g. 0.85 for 85% drop)
 */
const simulatedDrops = new Map();

/**
 * Baseline historical order volumes per dark store ID.
 * Key: darkStoreId -> Value: baseline orders per 90-minute window
 */
const BASELINE_VOLUMES = {
  'BLK-DEL-001': 140,
  'BLK-DEL-002': 125,
  'ZPT-MUM-001': 150,
  'ZPT-MUM-002': 130,
  'SWG-BLR-001': 160,
  'SWG-BLR-002': 135,
};

const DEFAULT_BASELINE = 120;

/**
 * Fetches recent order volume for a dark store over a given time window.
 *
 * @param {string} tenantId - Tenant identifier
 * @param {string} darkStoreId - Dark store UUID or code
 * @param {string} [window='90min'] - Time window (e.g., '90min', '60min')
 * @returns {Promise<number>} Number of completed/active orders in the window
 */
async function getOrderVolume(tenantId, darkStoreId, window = '90min') {
  logger.debug('Fetching platform order volume for dark store', {
    tenantId,
    darkStoreId,
    window,
  });

  const historical = await getHistoricalOrderVolume(darkStoreId);

  // Check if a simulated drop is currently active for this dark store
  if (simulatedDrops.has(darkStoreId)) {
    const dropPercentage = simulatedDrops.get(darkStoreId);
    const simulatedVolume = Math.max(0, Math.round(historical * (1 - dropPercentage)));
    logger.info('Simulated order volume drop applied', {
      darkStoreId,
      dropPercentage,
      simulatedVolume,
      historical,
    });
    return simulatedVolume;
  }

  // Normal operations: realistic volume with random jitter (±8%)
  const jitterFactor = 0.92 + Math.random() * 0.16;
  const currentVolume = Math.round(historical * jitterFactor);

  return currentVolume;
}

/**
 * Fetches historical average order volume for a dark store for a comparable time window.
 *
 * @param {string} darkStoreId - Dark store UUID or code
 * @returns {Promise<number>} Historical average order volume
 */
async function getHistoricalOrderVolume(darkStoreId) {
  if (BASELINE_VOLUMES[darkStoreId]) {
    return BASELINE_VOLUMES[darkStoreId];
  }

  // Generate deterministic baseline from darkStoreId string hash
  let hash = 0;
  for (let i = 0; i < darkStoreId.length; i++) {
    hash = (hash << 5) - hash + darkStoreId.charCodeAt(i);
    hash |= 0;
  }
  const variance = Math.abs(hash % 40); // 0 to 39
  return DEFAULT_BASELINE + variance; // 120 to 159
}

/**
 * Test helper: inject a simulated volume drop for a dark store.
 *
 * @param {string} darkStoreId - Dark store identifier
 * @param {number} dropPercentage - Fraction of drop between 0.0 and 1.0 (e.g. 0.80 for 80% drop)
 */
function setSimulatedDrop(darkStoreId, dropPercentage) {
  simulatedDrops.set(darkStoreId, Math.min(Math.max(dropPercentage, 0), 1));
  logger.info('Registered simulated drop for dark store', { darkStoreId, dropPercentage });
}

/**
 * Test helper: clear a simulated volume drop for a dark store.
 *
 * @param {string} darkStoreId - Dark store identifier
 */
function clearSimulatedDrop(darkStoreId) {
  simulatedDrops.delete(darkStoreId);
  logger.info('Cleared simulated drop for dark store', { darkStoreId });
}

/**
 * Test helper: reset all simulated volume drops.
 */
function resetAllSimulations() {
  simulatedDrops.clear();
  logger.info('Reset all platform API simulations');
}

module.exports = {
  getOrderVolume,
  getHistoricalOrderVolume,
  setSimulatedDrop,
  clearSimulatedDrop,
  resetAllSimulations,
};
