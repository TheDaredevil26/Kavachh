'use strict';

const { Worker } = require('bullmq');
const prisma = require('../../db/prisma');
const { redis } = require('../../config/redis');
const env = require('../../config/env');
const queues = require('../../config/queues');
const { withRedisLock } = require('../../utils/lock');
const logger = require('../../utils/logger');
const { ClaimStateMachine } = require('./stateMachine');
const { computeConfidenceScore, makeClaimDecision, reviewPriority } = require('./decisionEngine');
const mlClient = require('./mlClient');
const { createStandardFraudPipeline } = require('./fraud');
const { detectZoneFraudRing } = require('./fraud/ringDetection');
const { MlPredictionLog, GpsPing, ActivityEvent, DarkStoreCheckin } = require('../../db/mongo');

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };
const sm = new ClaimStateMachine(prisma, redis);
const fraudPipeline = createStandardFraudPipeline();

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800, count: 5000 },
};

/**
 * Build complete evaluation context for ML inference and Fraud Pipeline.
 *
 * @param {string} claimId
 * @param {object} [extra]
 * @returns {Promise<object>}
 */
async function buildClaimContext(claimId, extra = {}) {
  const claim = await prisma.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: {
      worker: true,
      policy: true,
      triggerEvent: true,
    },
  });

  const worker = claim.worker;
  const policy = claim.policy;
  const trigger = claim.triggerEvent;

  // Retrieve telemetry from MongoDB in parallel
  const [gpsPings, recentActivity, checkin] = await Promise.all([
    GpsPing.find({ worker_id: worker.id })
      .sort({ recorded_at: -1 })
      .limit(10)
      .lean()
      .catch(() => []),
    ActivityEvent.findOne({ worker_id: worker.id })
      .sort({ recorded_at: -1 })
      .lean()
      .catch(() => null),
    DarkStoreCheckin.findOne({ worker_id: worker.id, verified: true })
      .sort({ checked_in_at: -1 })
      .lean()
      .catch(() => null),
  ]);

  const gpsHistory = (gpsPings || []).reverse().map((p) => ({
    lat: p.location.coordinates[1],
    lng: p.location.coordinates[0],
    timestamp: new Date(p.recorded_at).getTime(),
    jitter: p.accuracy_m || 1.0,
  }));

  return {
    claimId,
    claim,
    workerId: worker.id,
    worker,
    tenantId: claim.tenantId,
    policyId: policy.id,
    policy,
    triggerId: trigger.id,
    trigger,
    gpsHistory,
    latestActivity: recentActivity,
    latestCheckin: checkin,
    gps: extra.gps || null,
  };
}

/**
 * Convert layer evaluations and ML result into signals map for DecisionEngine.
 *
 * @param {object} ml
 * @param {Array} layers
 * @returns {object}
 */
function toSignals(ml, layers) {
  const signals = {
    ml_fraud_probability: ml.fraud_probability,
  };

  for (const layer of layers) {
    if (layer.type === 'gps_physics') {
      signals.gps_physics = layer.score;
      signals.gps_verification = layer.score;
    } else if (layer.type === 'temporal') {
      signals.pre_trigger_activity = layer.score;
      signals.checkin_verification = layer.score;
    } else if (layer.type === 'platform_activity') {
      signals.platform_delivery = layer.score;
      signals.activity_consistency = layer.score;
    } else if (layer.type === 'network_graph') {
      signals.network_graph = layer.score;
    } else if (layer.type === 'zone_claim_rate') {
      signals.zone_claim_rate = layer.score;
      signals.trigger_correlation = layer.score;
    }
  }

  return signals;
}

/**
 * ─────────────────────────────────────────────────────────────
 * WORKER 1: claim-validate
 * State transition: filed → validated (or rejected if ceiling exceeded)
 * Under row lock on policy:
 * - Checks coverage ceiling: available = ceiling - reserved - settled
 * - Reserves max_payout_per_event
 * - Transitions claim to 'validated'
 * - Enqueues 'fraud-eval' job
 * ──────────────────────────────────────────────────────────── */
const validationWorker = new Worker(
  'claim-validate',
  async (job) => {
    const { claimId, gps } = job.data;
    logger.info('Processing claim validation job', { claimId, jobId: job.id });

    await withRedisLock(`lock:claim:${claimId}`, 15000, async () => {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });

        if (claim.status !== 'filed') {
          logger.info('Claim already past filed state, skipping validation', { claimId, status: claim.status });
          return;
        }

        // Row-level lock on the POLICY
        const policyRows = await tx.$queryRaw`
          SELECT id, coverage_ceiling, reserved_amount, settled_amount, max_payout_per_event
          FROM policies WHERE id = ${claim.policyId}::uuid FOR UPDATE
        `;

        if (!policyRows || policyRows.length === 0) {
          throw new Error(`Policy ${claim.policyId} not found during validation`);
        }

        const p = policyRows[0];
        const coverageCeiling = Number(p.coverage_ceiling);
        const reservedAmount = Number(p.reserved_amount);
        const settledAmount = Number(p.settled_amount);
        const maxPayout = Number(p.max_payout_per_event);

        const available = coverageCeiling - reservedAmount - settledAmount;

        if (available < maxPayout) {
          logger.warn('Claim rejected: coverage ceiling exhausted', {
            claimId,
            coverageCeiling,
            reservedAmount,
            settledAmount,
            maxPayout,
          });

          await sm.transition(claimId, 'rejected', 'system:validate', {
            tx,
            reason: 'COVERAGE_CEILING_REACHED',
            patch: { holdReason: 'Policy coverage ceiling reached for the period' },
          });
          return;
        }

        // Reserve payout amount against policy ceiling
        await tx.policy.update({
          where: { id: p.id },
          data: { reservedAmount: { increment: maxPayout } },
        });

        // Transition claim: filed → validated
        await sm.transition(claimId, 'validated', 'system:validate', { tx });
      });
    });

    // Enqueue next step in pipeline: fraud-eval
    const fraudQueue = queues['fraud-eval'];
    if (fraudQueue) {
      await fraudQueue.add('score', { claimId, gps }, { ...defaultJobOpts, jobId: `score:${claimId}` });
    }
  },
  { connection, concurrency: 10 }
);

validationWorker.on('failed', (job, err) => {
  logger.error('claim-validate job failed', { jobId: job?.id, error: err.message });
});

/**
 * ─────────────────────────────────────────────────────────────
 * WORKER 2: fraud-eval
 * State transition: validated → scoring → decided → (payout_pending | held)
 * - Transitions to scoring
 * - Gathers context & runs fraud layers + ML inference
 * - Computes composite confidence score & decision
 * - Stores fraud signals in PostgreSQL & ML prediction log in MongoDB
 * - If hold: transitions to 'held' with priority score, releases reserved funds
 * - If approve/partial: transitions to 'payout_pending', enqueues 'payout' job
 * - Triggers zone fraud ring detector
 * ──────────────────────────────────────────────────────────── */
const fraudWorker = new Worker(
  'fraud-eval',
  async (job) => {
    const { claimId, gps } = job.data;
    logger.info('Processing fraud evaluation job', { claimId, jobId: job.id });

    // Transition validated → scoring
    await sm.transition(claimId, 'scoring', 'system:fraud-eval');

    // 1. Build comprehensive evaluation context
    const ctx = await buildClaimContext(claimId, { gps });

    // 2. Run independent fraud layers concurrently
    const layerResults = await fraudPipeline.run(ctx);

    // Map layer results keyed by type for ML contract
    ctx.layerResults = {};
    for (const r of layerResults) {
      ctx.layerResults[r.type] = r;
    }

    // 3. Call ML Inference Service (Pub/Sub → HTTP Circuit Breaker → Rule-based fallback)
    const startTime = Date.now();
    const ml = await mlClient.score(ctx);
    const latencyMs = Date.now() - startTime;

    // 4. Compute composite confidence score & decision recommendation
    const signals = toSignals(ml, layerResults);
    const confidence = computeConfidenceScore(ml.fraud_probability, signals);
    const decisionObj = makeClaimDecision(confidence);
    const decision = decisionObj.decision;
    const payoutPercentage = decisionObj.payoutPercentage;

    const policy = ctx.policy;
    const maxPayout = Number(policy.maxPayoutPerEvent);
    const payoutAmount = Math.round((maxPayout * payoutPercentage) / 100);

    // 5. Store fraud signals in Postgres
    if (layerResults && layerResults.length > 0) {
      await prisma.fraudSignal.createMany({
        data: layerResults.map((l) => ({
          claimId,
          signalType: l.type,
          isSuspicious: l.suspicious,
          score: l.score,
          details: l.details || {},
        })),
      });
    }

    // 6. Record ML prediction log in MongoDB for audit and retraining
    try {
      await MlPredictionLog.create({
        claim_id: claimId,
        worker_id: ctx.workerId,
        tenant_id: ctx.tenantId,
        model_version: ml.model_version || 'unknown',
        features: ml.features || {},
        fraud_probability: ml.fraud_probability,
        confidence_score: confidence,
        decision,
        latency_ms: latencyMs,
        predicted_at: new Date(),
      });
    } catch (mongoErr) {
      logger.error('Failed to write ML prediction log to MongoDB', { error: mongoErr.message, claimId });
    }

    // 7. Transition scoring → decided
    await sm.transition(claimId, 'decided', 'system:fraud-eval', {
      patch: {
        confidenceScore: confidence,
        fraudProbability: ml.fraud_probability,
        payoutPercentage,
        payoutAmount,
        approvedAmount: maxPayout,
      },
    });

    // 8. Branch based on decision: hold vs payout_pending
    if (decision === 'hold') {
      const priority = reviewPriority(maxPayout, confidence);

      await sm.transition(claimId, 'held', 'system:fraud-eval', {
        reason: 'Low confidence score — flagged for manual review',
        patch: {
          isFlaggedForReview: true,
          reviewPriority: priority,
          holdReason: 'Fraud confidence score below automated approval threshold',
          heldUntil: new Date(Date.now() + 24 * 3600 * 1000), // 24h SLA
        },
      });

      // Release the temporary reservation since claim is held indefinitely
      await prisma.policy.update({
        where: { id: policy.id },
        data: { reservedAmount: { decrement: maxPayout } },
      });

      logger.info('Claim held for manual review', { claimId, confidence, priority });
    } else {
      // Auto-approved or partial payout
      await sm.transition(claimId, 'payout_pending', 'system:fraud-eval');

      // If partial payout, release the unspent portion of reserved amount
      const unspentDelta = maxPayout - payoutAmount;
      if (unspentDelta > 0) {
        await prisma.policy.update({
          where: { id: policy.id },
          data: { reservedAmount: { decrement: unspentDelta } },
        });
      }

      // Enqueue payout job
      const payoutQueue = queues['payout'];
      if (payoutQueue) {
        await payoutQueue.add('pay', { claimId }, { ...defaultJobOpts, jobId: `pay:${claimId}` });
      }
    }

    // 9. Check for zone-wide fraud ring signatures
    await detectZoneFraudRing(ctx.trigger.id, ctx.worker.zoneId);
  },
  { connection, concurrency: 10 }
);

fraudWorker.on('failed', (job, err) => {
  logger.error('fraud-eval job failed', { jobId: job?.id, error: err.message });
});

module.exports = {
  validationWorker,
  fraudWorker,
  buildClaimContext,
  toSignals,
};
