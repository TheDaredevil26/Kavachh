'use strict';

/**
 * Decision engine for claim evaluation.
 *
 * Combines ML fraud probability with rule-based signals to produce a
 * confidence score and an automated decision recommendation.
 */

/**
 * Weights for combining different signals into the final confidence score.
 * Higher weight = more influence on the outcome.
 */
const WEIGHTS = Object.freeze({
  ml_fraud_probability: 0.40,   // ML model's fraud probability (inverted)
  pre_trigger_activity: 0.20,   // In zone at T=0 (GPS / QR check-in)
  gps_physics: 0.15,            // GPS velocity & jitter check
  platform_delivery: 0.10,      // Recent deliveries before trigger
  network_graph: 0.05,          // BFS 2-hop / cluster check
  zone_claim_rate: 0.05,        // Claims to workers ratio
  claim_history: 0.05,          // Worker claim history
});

/**
 * Compute a composite confidence score from the ML fraud probability
 * and additional verification signals.
 *
 * @param {number} mlFraudProbability - Probability of fraud from ML model (0..1)
 * @param {object} signals            - Object with signal scores (each 0..1)
 * @returns {number} Composite confidence score between 0 and 1
 */
function computeConfidenceScore(mlFraudProbability, signals = {}) {
  // Invert fraud probability: high fraud probability → low confidence
  const mlConfidence = 1 - Math.max(0, Math.min(1, Number(mlFraudProbability) || 0));

  let totalWeight = WEIGHTS.ml_fraud_probability;
  let weightedSum = mlConfidence * WEIGHTS.ml_fraud_probability;

  // Normalized signal mappings supporting multiple naming conventions
  const resolvedSignals = {
    pre_trigger_activity: signals.pre_trigger_activity ?? signals.checkin_verification ?? signals.pre_trigger_active,
    gps_physics: signals.gps_physics ?? signals.gps_verification ?? signals.gps_physics_score,
    platform_delivery: signals.platform_delivery ?? signals.activity_consistency ?? (typeof signals.delivery_history_hours === 'number' ? Math.max(0, Math.min(1, 1 - signals.delivery_history_hours / 24)) : undefined),
    network_graph: signals.network_graph ?? signals.tenure ?? (typeof signals.registration_ip_cluster === 'number' ? Math.max(0, Math.min(1, 1 - (signals.registration_ip_cluster - 1) / 10)) : undefined),
    zone_claim_rate: signals.zone_claim_rate ?? signals.trigger_correlation,
    claim_history: signals.claim_history,
  };

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    if (key === 'ml_fraud_probability') continue;
    const value = resolvedSignals[key];
    if (value !== undefined && value !== null && !isNaN(Number(value))) {
      const clamped = Math.max(0, Math.min(1, Number(value)));
      weightedSum += clamped * weight;
      totalWeight += weight;
    }
  }

  // Normalise to account for any missing signals
  const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return Math.round(confidence * 10000) / 10000; // 4 decimal places
}

/**
 * Make a claim decision based on the composite confidence score.
 *
 * Decision thresholds:
 *   - confidence ≥ 0.65 → auto_approve (100% payout)
 *   - confidence ≥ 0.40 → partial (60% payout, remainder held)
 *   - confidence <  0.40 → hold (manual review required, 0% payout)
 *
 * @param {number} confidence - Composite confidence score (0..1)
 * @returns {{ decision: string, payoutPercentage: number }} Decision object
 */
function makeClaimDecision(confidence) {
  let decision;
  let payoutPercentage;

  if (confidence >= 0.65) {
    decision = 'auto_approve';
    payoutPercentage = 100;
  } else if (confidence >= 0.40) {
    decision = 'partial';
    payoutPercentage = 60;
  } else {
    decision = 'hold';
    payoutPercentage = 0;
  }

  const result = { decision, payoutPercentage };
  result.toString = () => decision;
  result.valueOf = () => decision;
  return result;
}

/**
 * Calculate a review priority score for manual review queue ordering.
 * Higher priority = should be reviewed sooner.
 *
 * Priority factors:
 *   - Amount score: up to 50 points based on payout size
 *   - Borderline score: up to 50 points based on proximity to 0.40 decision boundary
 *
 * @param {number|object} amount - Claimed or policy max amount in INR
 * @param {number} confidence    - Composite confidence score (0..1)
 * @returns {number} Priority score (higher = more urgent, 0–100 scale).
 */
function reviewPriority(amount, confidence) {
  const numAmount = typeof amount === 'number'
    ? amount
    : (amount && typeof amount.toNumber === 'function' ? amount.toNumber() : Number(amount) || 0);

  const safeConfidence = Math.max(0, Math.min(1, Number(confidence) || 0));

  const amountScore = Math.min(numAmount / 500, 1) * 50;
  const borderlineScore = (1 - Math.abs(0.40 - safeConfidence) / 0.40) * 50;

  return Math.round(amountScore + Math.max(borderlineScore, 0));
}

module.exports = {
  WEIGHTS,
  computeConfidenceScore,
  makeClaimDecision,
  reviewPriority,
};
