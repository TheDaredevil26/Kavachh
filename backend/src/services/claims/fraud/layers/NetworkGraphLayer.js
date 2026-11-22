'use strict';

const { FraudLayer } = require('../FraudLayer');
const { bfs2HopFraudCheck } = require('../graph');
const prisma = require('../../../../db/prisma');

/**
 * Layer B: Network Graph Analysis
 *
 * Traverses account-IP-device bipartite graph using BFS to depth 2:
 * 1. Checks if worker shares IP/device with any known fraudulent/suspended account.
 * 2. Checks IP/device farm clustering (e.g. > 5 accounts from 1 IP).
 */
class NetworkGraphLayer extends FraudLayer {
  constructor() {
    super('network_graph');
  }

  /**
   * @param {object} ctx
   * @param {string} ctx.workerId
   * @param {string} ctx.tenantId
   * @param {object} [ctx.worker]
   */
  async evaluate(ctx) {
    const workerId = ctx.workerId || (ctx.worker && ctx.worker.id);
    const tenantId = ctx.tenantId || (ctx.worker && ctx.worker.tenantId);

    if (!workerId || !tenantId) {
      return this.result(false, 0.9, { reason: 'Missing worker/tenant identifiers' });
    }

    try {
      const graphResult = await bfs2HopFraudCheck(workerId, tenantId, prisma);

      let score = 0.95;
      if (graphResult.fraudWithin2Hops) {
        score = 0.10; // Directly connected to known fraud within 2 hops
      } else if (graphResult.ipClusterSize > 5) {
        score = 0.30; // Part of large registration cluster
      } else if (graphResult.deviceClusterSize > 3) {
        score = 0.25; // Shared physical device across multiple accounts
      }

      return this.result(graphResult.isSuspicious, score, {
        fraudWithin2Hops: graphResult.fraudWithin2Hops,
        hopsToFraud: graphResult.hopsToFraud,
        ipClusterSize: graphResult.ipClusterSize,
        deviceClusterSize: graphResult.deviceClusterSize,
        clusterSize: graphResult.clusterSize,
        registration_ip_cluster: graphResult.ipClusterSize,
      });
    } catch (_err) {
      return this.result(false, 0.85, { error: 'Graph analysis non-fatal error' });
    }
  }
}

module.exports = NetworkGraphLayer;
