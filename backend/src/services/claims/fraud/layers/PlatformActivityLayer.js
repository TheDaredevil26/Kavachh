'use strict';

const { FraudLayer } = require('../FraudLayer');
const { ActivityEvent } = require('../../../../db/mongo');

/**
 * Layer E: Platform Activity Reconciliation
 *
 * Verifies whether the worker was genuinely working on the platform around
 * the time of the disruption event.
 * - Genuine worker: completed delivery within 0–4 hours of the trigger event
 * - Fraud ring / dormant account: no deliveries for days (> 48 hours)
 */
class PlatformActivityLayer extends FraudLayer {
  constructor() {
    super('platform_activity');
  }

  /**
   * @param {object} ctx
   * @param {string} ctx.workerId
   * @param {object} [ctx.worker]
   * @param {object} [ctx.trigger]
   */
  async evaluate(ctx) {
    const workerId = ctx.workerId || (ctx.worker && ctx.worker.id);
    const triggerTime = ctx.trigger && ctx.trigger.detectedAt
      ? new Date(ctx.trigger.detectedAt).getTime()
      : Date.now();

    if (!workerId) {
      return this.result(false, 0.85, { delivery_history_hours: 2.0 });
    }

    try {
      // Find latest platform activity / delivery event before or around trigger time
      const latestActivity = await ActivityEvent.findOne({
        worker_id: workerId,
        $or: [
          { event_type: { $in: ['order_delivered', 'delivery_completed', 'order_picked_up'] } },
          { 'payload.status': 'delivered' },
        ],
      })
        .sort({ recorded_at: -1 })
        .lean();

      let lastActivityTime = null;
      if (latestActivity && latestActivity.recorded_at) {
        lastActivityTime = new Date(latestActivity.recorded_at).getTime();
      } else if (ctx.worker && ctx.worker.lastActiveAt) {
        lastActivityTime = new Date(ctx.worker.lastActiveAt).getTime();
      }

      if (!lastActivityTime) {
        // No delivery recorded at all
        return this.result(true, 0.20, {
          delivery_history_hours: 99.0,
          dormant: true,
          reason: 'No platform activity records found',
        });
      }

      const diffMs = Math.max(0, triggerTime - lastActivityTime);
      const diffHours = Math.round((diffMs / (3600 * 1000)) * 100) / 100;

      const isDormant = diffHours > 48;
      let score = 0.95;

      if (diffHours <= 2.0) {
        score = 0.98; // Active delivery partner
      } else if (diffHours <= 12.0) {
        score = 0.85;
      } else if (diffHours <= 48.0) {
        score = 0.60;
      } else {
        score = 0.20; // Dormant account
      }

      return this.result(isDormant, score, {
        delivery_history_hours: diffHours,
        lastActivityAt: new Date(lastActivityTime).toISOString(),
        dormant: isDormant,
      });
    } catch (_err) {
      return this.result(false, 0.85, { delivery_history_hours: 2.0, error: 'Activity check degraded' });
    }
  }
}

module.exports = PlatformActivityLayer;
