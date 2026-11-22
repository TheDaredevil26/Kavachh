'use strict';

let CircuitBreaker;
try {
  CircuitBreaker = require('opossum');
} catch (_err) {
  // Graceful fallback implementation if opossum is not yet installed
  CircuitBreaker = class FallbackCircuitBreaker {
    constructor(action, options = {}) {
      this.action = action;
      this.options = options;
      this.fallbackFn = null;
    }
    fallback(fn) {
      this.fallbackFn = fn;
      return this;
    }
    async fire(...args) {
      try {
        return await this.action(...args);
      } catch (err) {
        if (this.fallbackFn) {
          return this.fallbackFn(...args);
        }
        throw err;
      }
    }
    on() {
      return this;
    }
  };
}

const axios = require('axios');
const env = require('../config/env');
const logger = require('./logger');

/**
 * Perform HTTP inference against the Python FastAPI ML microservice.
 *
 * @param {object} payload - Feature contract payload
 * @returns {Promise<object>} ML inference result
 */
async function callMlHttp(payload) {
  const url = `${env.ML_SERVICE_URL}/infer`;
  const response = await axios.post(url, payload, {
    timeout: 3000,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

/**
 * Rule-based fallback score when the ML service is down or circuit is open.
 * Conservative by design: tags model_version as 'rule-based-fallback' and
 * produces scores that lean toward 'partial' or 'hold' rather than unchecked auto-approval.
 *
 * @param {object} payload - Feature contract payload
 * @returns {object} Simulated ML result
 */
function ruleBasedFraudScore(payload = {}) {
  logger.warn('ML service unavailable — using rule-based fallback', {
    claimId: payload.claim_id,
    correlationId: payload.correlation_id,
  });

  const features = payload.features || payload;

  let fraudScore = 0.20; // Conservative base risk

  // Check 1: In zone before announcement?
  if (features.pre_trigger_active === 0 || features.pre_trigger_active === false) {
    fraudScore += 0.25;
  }

  // Check 2: High velocity or impossible physics?
  if (features.velocity_plausible === 0 || features.velocity_plausible === false) {
    fraudScore += 0.35;
  }

  // Check 3: Perfect/spoofed GPS jitter?
  if (typeof features.gps_jitter_score === 'number' && features.gps_jitter_score < 0.05) {
    fraudScore += 0.20;
  }

  // Check 4: Burst detected?
  if (features.burst_flag === 1 || features.burst_flag === true) {
    fraudScore += 0.20;
  }

  // Check 5: Zone claim rate anomaly (>70%)
  if (typeof features.zone_claim_rate === 'number' && features.zone_claim_rate > 0.70) {
    fraudScore += 0.20;
  }

  // Check 6: Dormant worker (>48h since delivery)
  if (typeof features.delivery_history_hours === 'number' && features.delivery_history_hours > 48) {
    fraudScore += 0.15;
  }

  // Check 7: IP cluster (>5 accounts from same IP)
  if (typeof features.registration_ip_cluster === 'number' && features.registration_ip_cluster > 5) {
    fraudScore += 0.20;
  }

  // Check 8: New account age (<3 days)
  if (typeof features.registration_age_days === 'number' && features.registration_age_days < 3) {
    fraudScore += 0.15;
  }

  const fraudProbability = Math.round(Math.min(0.95, Math.max(0.05, fraudScore)) * 10000) / 10000;
  const confidenceScore = Math.round((1 - fraudProbability) * 10000) / 10000;

  return {
    correlation_id: payload.correlation_id || null,
    claim_id: payload.claim_id || null,
    model_version: 'rule-based-fallback',
    contract_version: payload.contract_version || '1.0',
    fraud_probability: fraudProbability,
    confidence_score: confidenceScore,
    features,
    shap_top_factors: [
      { factor: 'rule_based_fallback_engaged', impact: 0.2 },
    ],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Circuit breaker instance for ML service HTTP fallback.
 */
const breakerOptions = {
  timeout: 3000,                  // If service doesn't respond in 3s, fail
  errorThresholdPercentage: 50,  // When 50% of requests fail, open circuit
  resetTimeout: 30000,            // Try again after 30 seconds
};

const mlBreaker = new CircuitBreaker(callMlHttp, breakerOptions);

mlBreaker.fallback((payload) => {
  return ruleBasedFraudScore(payload);
});

mlBreaker.on('open', () => logger.warn('ML HTTP Circuit Breaker: OPEN (traffic redirected to fallback)'));
mlBreaker.on('halfOpen', () => logger.info('ML HTTP Circuit Breaker: HALF-OPEN (testing service recovery)'));
mlBreaker.on('close', () => logger.info('ML HTTP Circuit Breaker: CLOSED (service healthy)'));

module.exports = {
  mlBreaker,
  ruleBasedFraudScore,
  callMlHttp,
};
