'use strict';

const { computeConfidenceScore, makeClaimDecision } = require('../../src/services/claims/decisionEngine');

describe('Decision Engine', () => {
  test('genuine worker gets auto-approved', () => {
    const score = computeConfidenceScore(0.05, {
      pre_trigger_active: 1,
      gps_physics_score: 0.9,
      delivery_history_hours: 1.5,
      registration_ip_cluster: 1,
      zone_claim_rate: 0.42,
    });
    expect(score).toBeGreaterThanOrEqual(0.65);
    expect(makeClaimDecision(score).decision).toBe('auto_approve');
    expect(makeClaimDecision(score).payoutPercentage).toBe(100);
  });

  test('borderline case gets partial approval', () => {
    const score = computeConfidenceScore(0.45, {
      pre_trigger_active: 0.6,
      gps_physics_score: 0.5,
      delivery_history_hours: 12.0,
      registration_ip_cluster: 4,
      zone_claim_rate: 0.50,
    });
    expect(score).toBeGreaterThanOrEqual(0.40);
    expect(score).toBeLessThan(0.65);
    expect(makeClaimDecision(score).decision).toBe('partial');
    expect(makeClaimDecision(score).payoutPercentage).toBe(60);
  });

  test('fraud ring actor gets held', () => {
    const score = computeConfidenceScore(0.95, {
      pre_trigger_active: 0,
      gps_physics_score: 0.02,
      delivery_history_hours: 120,
      registration_ip_cluster: 25,
      zone_claim_rate: 0.88,
    });
    expect(score).toBeLessThan(0.40);
    expect(makeClaimDecision(score).decision).toBe('hold');
    expect(makeClaimDecision(score).payoutPercentage).toBe(0);
  });
});
