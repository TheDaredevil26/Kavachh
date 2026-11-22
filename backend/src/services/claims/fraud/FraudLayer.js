'use strict';

/**
 * Base abstract class for all Fraud Detection Layers.
 * Follows Strategy & Template Method design pattern.
 */
class FraudLayer {
  /**
   * @param {string} [type] - Layer identifier
   */
  constructor(type) {
    this.type = type || this.constructor.name.replace(/Layer$/, '').toLowerCase();
  }

  /**
   * Evaluates the claim context against this layer's fraud criteria.
   *
   * @param {object} _ctx - Claim evaluation context
   * @returns {Promise<{ type: string, suspicious: boolean, score: number, details: object }>}
   */
  async evaluate(_ctx) {
    throw new Error(`${this.constructor.name} must implement evaluate(ctx)`);
  }

  /**
   * Helper to construct a standardized LayerResult.
   *
   * @param {boolean} suspicious - True if suspicious patterns detected
   * @param {number} score       - Genuine confidence score (0 to 1)
   * @param {object} [details]   - Metadata, intermediate calculations
   * @returns {{ type: string, suspicious: boolean, score: number, details: object }}
   */
  result(suspicious, score, details = {}) {
    const clampedScore = Math.max(
      0,
      Math.min(1, typeof score === 'number' ? score : (suspicious ? 0.1 : 0.9))
    );
    return {
      type: this.type,
      suspicious: Boolean(suspicious),
      score: Math.round(clampedScore * 10000) / 10000,
      details: details || {},
    };
  }
}

/**
 * Composite pipeline that executes multiple independent fraud layers concurrently.
 */
class FraudPipeline {
  /**
   * @param {FraudLayer[]} [layers]
   */
  constructor(layers = []) {
    this.layers = layers;
  }

  /**
   * Add a layer to the pipeline.
   *
   * @param {FraudLayer} layer
   * @returns {FraudPipeline}
   */
  addLayer(layer) {
    if (layer instanceof FraudLayer) {
      this.layers.push(layer);
    }
    return this;
  }

  /**
   * Run all layers in parallel.
   *
   * @param {object} ctx - Claim context
   * @returns {Promise<Array<{ type: string, suspicious: boolean, score: number, details: object }>>}
   */
  async run(ctx) {
    return Promise.all(this.layers.map((layer) => layer.evaluate(ctx)));
  }
}

// Export base classes first to prevent circular dependency issues in child layers
module.exports = {
  FraudLayer,
  FraudPipeline,
};

module.exports.GpsPhysicsLayer = require('./layers/GpsPhysicsLayer');
module.exports.NetworkGraphLayer = require('./layers/NetworkGraphLayer');
module.exports.BurstLayer = require('./layers/BurstLayer');
module.exports.ZoneRateLayer = require('./layers/ZoneRateLayer');
module.exports.PlatformActivityLayer = require('./layers/PlatformActivityLayer');
module.exports.TemporalLayer = require('./layers/TemporalLayer');
