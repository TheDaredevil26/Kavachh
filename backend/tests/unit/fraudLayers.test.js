'use strict';

const {
  GpsPhysicsLayer,
  NetworkGraphLayer,
  BurstLayer,
  ZoneRateLayer,
  PlatformActivityLayer,
  TemporalLayer,
  FraudPipeline
} = require('../../src/services/claims/fraud/FraudLayer');

describe('Fraud Detection Layers', () => {
  describe('GpsPhysicsLayer', () => {
    const layer = new GpsPhysicsLayer();

    test('flags impossible velocity (> 80 km/h on scooter)', async () => {
      const result = await layer.evaluate({
        gpsHistory: [
          { lat: 12.934567, lng: 77.610123, ts: new Date(Date.now() - 60000).toISOString(), jitter: 0.8 },
          { lat: 13.134567, lng: 77.810123, ts: new Date().toISOString(), jitter: 0.8 } // ~30km in 1 min
        ]
      });
      expect(result.suspicious).toBe(true);
      expect(result.score).toBeLessThanOrEqual(0.1);
    });

    test('flags programmatic zero-jitter spoofed GPS', async () => {
      const result = await layer.evaluate({
        gpsHistory: [
          { lat: 12.934567, lng: 77.610123, ts: new Date(Date.now() - 10000).toISOString(), jitter: 0.001 },
          { lat: 12.934568, lng: 77.610124, ts: new Date(Date.now() - 5000).toISOString(), jitter: 0.001 },
          { lat: 12.934569, lng: 77.610125, ts: new Date().toISOString(), jitter: 0.001 }
        ]
      });
      expect(result.suspicious).toBe(true);
    });
  });

  describe('FraudPipeline Composition', () => {
    test('runs all registered layers in parallel', async () => {
      const l1 = new GpsPhysicsLayer();
      const l2 = new NetworkGraphLayer();
      const l3 = new BurstLayer();
      const l4 = new ZoneRateLayer();
      const l5 = new PlatformActivityLayer();
      const l6 = new TemporalLayer();

      // Mock DB calls for layers that need external connections
      jest.spyOn(l2, 'evaluate').mockResolvedValue(l2.result(false, 0.95));
      jest.spyOn(l3, 'evaluate').mockResolvedValue(l3.result(false, 0.90));
      jest.spyOn(l4, 'evaluate').mockResolvedValue(l4.result(false, 0.92));
      jest.spyOn(l5, 'evaluate').mockResolvedValue(l5.result(false, 0.88));
      jest.spyOn(l6, 'evaluate').mockResolvedValue(l6.result(false, 0.94));

      const pipeline = new FraudPipeline([l1, l2, l3, l4, l5, l6]);

      const results = await pipeline.run({
        gpsHistory: [
          { lat: 12.934567, lng: 77.610123, ts: new Date(Date.now() - 60000).toISOString(), jitter: 0.8 },
          { lat: 12.934600, lng: 77.610150, ts: new Date().toISOString(), jitter: 0.8 },
        ],
        worker: { id: 'w1', zoneId: '560034', registrationIp: '127.0.0.1' },
        trigger: { id: 't1', detectedAt: new Date() }
      });

      expect(results).toHaveLength(6);
      expect(results.map(r => r.type)).toEqual(
        expect.arrayContaining(['gps_physics', 'network_graph', 'burst', 'zone_claim_rate', 'platform_activity', 'temporal'])
      );
    });
  });
});
