'use strict';

const { FraudLayer } = require('../FraudLayer');
const { haversineDistance } = require('../../../../utils/geo');
const { GpsPing } = require('../../../../db/mongo');

/**
 * Layer A: GPS Physics Validation
 *
 * Validates physical plausibility of GPS readings:
 * 1. Velocity check: Calculates velocity between consecutive GPS readings.
 *    Speeds > 80 km/h on standard delivery bikes/scooters indicate spoofing or teleportation.
 * 2. Jitter check: Measures hardware noise (jitter) across recent GPS pings.
 *    Real hardware GPS has 0.5–2.0m of standard deviation noise.
 *    Pure programmatic GPS mocks produce 0 jitter (perfect stationary coordinates).
 */
class GpsPhysicsLayer extends FraudLayer {
  constructor() {
    super('gps_physics');
  }

  /**
   * Helper: calculate population standard deviation of an array of numbers.
   *
   * @param {number[]} arr
   * @returns {number}
   */
  stddev(arr) {
    if (!arr || arr.length <= 1) return 0.5; // fallback to neutral
    const n = arr.length;
    const mean = arr.reduce((acc, v) => acc + v, 0) / n;
    const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
    return Math.sqrt(variance);
  }

  /**
   * @param {object} ctx
   * @param {string} ctx.workerId
   * @param {object} ctx.claim
   * @param {Array}  [ctx.gpsHistory]
   */
  async evaluate(ctx) {
    let pings = ctx.gpsHistory;

    // If not passed in context, load recent GPS pings from MongoDB
    if (!pings || pings.length === 0) {
      try {
        const docs = await GpsPing.find({ worker_id: ctx.workerId })
          .sort({ recorded_at: -1 })
          .limit(10)
          .lean();

        pings = (docs || []).reverse().map((d) => ({
          lat: d.location.coordinates[1],
          lng: d.location.coordinates[0],
          timestamp: new Date(d.recorded_at).getTime(),
        }));
      } catch (_err) {
        pings = [];
      }
    }

    // If claim included a current GPS coordinate, append it
    if (ctx.gps && typeof ctx.gps.lat === 'number' && typeof ctx.gps.lng === 'number') {
      pings = [...pings, { lat: ctx.gps.lat, lng: ctx.gps.lng, timestamp: Date.now() }];
    }

    // Default if insufficient telemetry data available
    if (pings.length < 2) {
      return this.result(false, 0.85, {
        reason: 'Insufficient GPS telemetry history (assumed benign)',
        maxKmh: 0,
        jitterScore: 0.8,
        velocityPlausible: true,
      });
    }

    // Normalize pings with timestamp
    pings = pings.map((p) => ({
      ...p,
      timestamp: typeof p.timestamp === 'number'
        ? p.timestamp
        : (p.ts ? new Date(p.ts).getTime() : Date.now()),
    }));

    // 1. Calculate speeds between consecutive points
    let maxKmh = 0;
    const speeds = [];

    for (let i = 1; i < pings.length; i++) {
      const p1 = pings[i - 1];
      const p2 = pings[i];
      const distKm = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      const timeHours = Math.abs(p2.timestamp - p1.timestamp) / (1000 * 3600);

      if (timeHours > 0) {
        const speedKmh = distKm / timeHours;
        speeds.push(speedKmh);
        if (speedKmh > maxKmh) {
          maxKmh = speedKmh;
        }
      }
    }

    // Check spatial jitter over the last 5 coordinates (in meters)
    const recentPings = pings.slice(-5);
    const hasExplicitJitter = recentPings.some((p) => typeof p.jitter === 'number');
    let tooPerfectJitter = false;
    let jitterMeters = 0.5;

    if (hasExplicitJitter) {
      jitterMeters = Math.min(...recentPings.filter(p => typeof p.jitter === 'number').map(p => p.jitter));
      tooPerfectJitter = jitterMeters < 0.05;
    } else {
      const lats = recentPings.map((p) => p.lat);
      const lngs = recentPings.map((p) => p.lng);

      const latStdMeters = this.stddev(lats) * 111000;
      const lngStdMeters = this.stddev(lngs) * 111000 * Math.cos((lats[0] * Math.PI) / 180);
      jitterMeters = Math.sqrt(latStdMeters * latStdMeters + lngStdMeters * lngStdMeters);
      tooPerfectJitter = recentPings.length >= 3 && jitterMeters < 0.05;
    }

    const impossibleVelocity = maxKmh > 80;
    const suspicious = impossibleVelocity || tooPerfectJitter;

    let score = 0.95;
    if (impossibleVelocity) {
      score = 0.05;
    } else if (tooPerfectJitter) {
      score = 0.20;
    }

    return this.result(suspicious, score, {
      maxKmh: Math.round(maxKmh * 100) / 100,
      jitterMeters: Math.round(jitterMeters * 1000) / 1000,
      impossibleVelocity,
      tooPerfectJitter,
      velocityPlausible: !impossibleVelocity,
      gps_jitter_score: Math.round(jitterMeters * 100) / 100,
    });
  }
}

module.exports = GpsPhysicsLayer;
