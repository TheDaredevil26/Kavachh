'use strict';

/**
 * Union-Find (Disjoint Set Union - DSU) data structure with
 * Path Compression and Union by Rank for near O(α(N)) operations.
 * Used for clustering workers sharing registration IP or device fingerprints.
 */
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
    this.size = new Map();
  }

  /**
   * Register a new element if not already tracked.
   *
   * @param {string} item
   */
  makeSet(item) {
    if (!this.parent.has(item)) {
      this.parent.set(item, item);
      this.rank.set(item, 0);
      this.size.set(item, 1);
    }
  }

  /**
   * Find root representative of element with path compression.
   *
   * @param {string} item
   * @returns {string} Root representative
   */
  find(item) {
    this.makeSet(item);
    if (this.parent.get(item) !== item) {
      this.parent.set(item, this.find(this.parent.get(item)));
    }
    return this.parent.get(item);
  }

  /**
   * Union two sets by rank.
   *
   * @param {string} a
   * @param {string} b
   * @returns {boolean} True if sets were merged, false if already in same set
   */
  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) {
      return false;
    }

    const rankA = this.rank.get(rootA) || 0;
    const rankB = this.rank.get(rootB) || 0;
    const sizeA = this.size.get(rootA) || 1;
    const sizeB = this.size.get(rootB) || 1;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
      this.size.set(rootB, sizeA + sizeB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
      this.size.set(rootA, sizeA + sizeB);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
      this.size.set(rootA, sizeA + sizeB);
    }

    return true;
  }

  /**
   * Get size of the component/cluster that item belongs to.
   *
   * @param {string} item
   * @returns {number}
   */
  getClusterSize(item) {
    const root = this.find(item);
    return this.size.get(root) || 1;
  }

  /**
   * Return all clusters grouped by their root representative.
   *
   * @returns {Map<string, string[]>}
   */
  getClusters() {
    const clusters = new Map();
    for (const item of this.parent.keys()) {
      const root = this.find(item);
      if (!clusters.has(root)) {
        clusters.set(root, []);
      }
      clusters.get(root).push(item);
    }
    return clusters;
  }
}

/**
 * Breadth-First Search (BFS) to depth 2 over an Account-IP-Device bipartite graph.
 *
 * Graph structure:
 *   Hop 0: target worker
 *   Hop 1: shared registration IP / device fingerprints
 *   Hop 2: all other accounts connected to those identifiers
 *
 * Checks if any account within 2 hops is flagged as fraudulent, suspended,
 * or rejected with fraud indicators.
 *
 * @param {string} workerId  - UUID of worker to evaluate
 * @param {string} tenantId  - Tenant UUID
 * @param {object} prisma    - Prisma client instance
 * @returns {Promise<{
 *   isSuspicious: boolean,
 *   fraudWithin2Hops: boolean,
 *   hopsToFraud: number | null,
 *   clusterSize: number,
 *   connectedAccountIds: string[],
 *   ipClusterSize: number,
 *   deviceClusterSize: number
 * }>}
 */
async function bfs2HopFraudCheck(workerId, tenantId, prisma) {
  // Step 1: Fetch target worker identifiers
  const worker = await prisma.worker.findUnique({
    where: { id: workerId },
    select: {
      id: true,
      tenantId: true,
      registrationIpAddress: true,
      registrationDeviceFingerprint: true,
      status: true,
    },
  });

  if (!worker) {
    return {
      isSuspicious: false,
      fraudWithin2Hops: false,
      hopsToFraud: null,
      clusterSize: 1,
      connectedAccountIds: [],
      ipClusterSize: 1,
      deviceClusterSize: 1,
    };
  }

  const { registrationIpAddress, registrationDeviceFingerprint } = worker;

  if (!registrationIpAddress && !registrationDeviceFingerprint) {
    return {
      isSuspicious: false,
      fraudWithin2Hops: false,
      hopsToFraud: null,
      clusterSize: 1,
      connectedAccountIds: [],
      ipClusterSize: 1,
      deviceClusterSize: 1,
    };
  }

  // Step 2: Query Hop 2 accounts sharing IP or device
  const orConditions = [];
  if (registrationIpAddress) {
    orConditions.push({ registrationIpAddress });
  }
  if (registrationDeviceFingerprint) {
    orConditions.push({ registrationDeviceFingerprint });
  }

  const connectedWorkers = await prisma.worker.findMany({
    where: {
      tenantId,
      OR: orConditions,
    },
    select: {
      id: true,
      status: true,
      registrationIpAddress: true,
      registrationDeviceFingerprint: true,
      claims: {
        where: {
          OR: [
            { isFlaggedForReview: true },
            { status: 'rejected' },
            { fraudProbability: { gte: 0.70 } },
          ],
        },
        select: { id: true, status: true, fraudProbability: true },
        take: 3,
      },
    },
  });

  let ipCount = 0;
  let deviceCount = 0;
  let fraudWithin2Hops = false;
  let hopsToFraud = null;
  const connectedAccountIds = [];

  for (const cw of connectedWorkers) {
    if (cw.id === workerId) continue;

    connectedAccountIds.push(cw.id);

    if (registrationIpAddress && cw.registrationIpAddress === registrationIpAddress) {
      ipCount++;
    }
    if (registrationDeviceFingerprint && cw.registrationDeviceFingerprint === registrationDeviceFingerprint) {
      deviceCount++;
    }

    // Check if connected worker is suspicious / fraudulent
    const hasFraudClaim = Array.isArray(cw.claims) && cw.claims.length > 0;
    const isSuspended = cw.status === 'suspended' || cw.status === 'blocked';

    if (hasFraudClaim || isSuspended) {
      fraudWithin2Hops = true;
      hopsToFraud = 2; // worker -> IP/device (hop 1) -> bad account (hop 2)
    }
  }

  const clusterSize = connectedWorkers.length;
  // Suspicious if cluster size > 5 from same IP or device, or if connected to fraud account
  const isSuspicious = fraudWithin2Hops || ipCount > 5 || deviceCount > 3;

  return {
    isSuspicious,
    fraudWithin2Hops,
    hopsToFraud,
    clusterSize,
    connectedAccountIds,
    ipClusterSize: ipCount + 1,
    deviceClusterSize: deviceCount + 1,
  };
}

module.exports = {
  UnionFind,
  bfs2HopFraudCheck,
};
