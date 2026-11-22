'use strict';

const { FraudLayer, FraudPipeline } = require('./FraudLayer');
const GpsPhysicsLayer = require('./layers/GpsPhysicsLayer');
const NetworkGraphLayer = require('./layers/NetworkGraphLayer');
const BurstLayer = require('./layers/BurstLayer');
const ZoneRateLayer = require('./layers/ZoneRateLayer');
const PlatformActivityLayer = require('./layers/PlatformActivityLayer');
const TemporalLayer = require('./layers/TemporalLayer');
const { UnionFind, bfs2HopFraudCheck } = require('./graph');
const { detectZoneFraudRing } = require('./ringDetection');

/**
 * Factory creating standard 6-layer Kavach Fraud Pipeline.
 *
 * @returns {FraudPipeline}
 */
function createStandardFraudPipeline() {
  return new FraudPipeline([
    new GpsPhysicsLayer(),
    new NetworkGraphLayer(),
    new BurstLayer(),
    new ZoneRateLayer(),
    new PlatformActivityLayer(),
    new TemporalLayer(),
  ]);
}

module.exports = {
  FraudLayer,
  FraudPipeline,
  GpsPhysicsLayer,
  NetworkGraphLayer,
  BurstLayer,
  ZoneRateLayer,
  PlatformActivityLayer,
  TemporalLayer,
  UnionFind,
  bfs2HopFraudCheck,
  detectZoneFraudRing,
  createStandardFraudPipeline,
};
