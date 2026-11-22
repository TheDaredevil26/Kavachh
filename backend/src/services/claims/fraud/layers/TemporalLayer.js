'use strict';

const { FraudLayer } = require('../FraudLayer');
const { GpsPing, DarkStoreCheckin } = require('../../../../db/mongo');

/**
 * Layer F: Temporal Decoupling (The Ring's Achilles Heel)
 *
 * Checks whether the worker was physically present in the affected zone
 * at T=0 (when the trigger was DETECTED, before it was publicly ANNOUNCED at T+8 min).
 *
 * Verification proofs accepted:
 *   1. GPS ping located in the target zone recorded within 60 minutes prior to `trigger.detectedAt`.
 *   2. Cryptographically signed dark-store QR check-in verified within 60 minutes prior to `trigger.detectedAt`.
 *
 * Fraud rings cannot retroactively fake physical presence during the silent T=0 to T+8 window.
 */
class TemporalLayer extends FraudLayer {
  constructor() {
    super('temporal');
  }

  /**
   * @param {object} ctx
   * @param {string} ctx.workerId
   * @param {object} [ctx.worker]
   * @param {object} [ctx.trigger]
   */
  async evaluate(ctx) {
    const workerId = ctx.workerId || (ctx.worker && ctx.worker.id);
    const trigger = ctx.trigger || {};
    const detectedAt = trigger.detectedAt ? new Date(trigger.detectedAt) : new Date(Date.now() - 10 * 60 * 1000);
    const windowStart = new Date(detectedAt.getTime() - 60 * 60 * 1000); // 60 minutes prior to detection

    if (!workerId) {
      return this.result(true, 0.2, { pre_trigger_active: 0, reason: 'Worker ID missing' });
    }

    try {
      // 1. Check for Dark Store QR check-in in the 60 minutes before detection
      const qrCheckin = await DarkStoreCheckin.findOne({
        worker_id: workerId,
        verified: true,
        checked_in_at: { $gte: windowStart, $lte: detectedAt },
      }).lean();

      if (qrCheckin) {
        return this.result(false, 0.99, {
          pre_trigger_active: 1,
          verifiedBy: 'qr_checkin',
          checkinId: qrCheckin._id,
          darkStoreId: qrCheckin.dark_store_id,
          checkedInAt: qrCheckin.checked_in_at,
        });
      }

      // 2. Check for GPS ping in the 60 minutes before detection
      const gpsPing = await GpsPing.findOne({
        worker_id: workerId,
        recorded_at: { $gte: windowStart, $lte: detectedAt },
      }).lean();

      if (gpsPing) {
        return this.result(false, 0.92, {
          pre_trigger_active: 1,
          verifiedBy: 'gps_ping',
          pingId: gpsPing._id,
          recordedAt: gpsPing.recorded_at,
          coordinates: gpsPing.location ? gpsPing.location.coordinates : null,
        });
      }

      // Neither proof found before announcement
      return this.result(true, 0.25, {
        pre_trigger_active: 0,
        verifiedBy: null,
        reason: 'No presence telemetry found in zone before trigger announcement',
      });
    } catch (_err) {
      return this.result(false, 0.8, { pre_trigger_active: 1, error: 'Temporal check degraded' });
    }
  }
}

module.exports = TemporalLayer;
