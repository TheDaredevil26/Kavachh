'use strict';

const claimsService = require('./service');
const { getReviewQueue } = require('./reviewQueue');
const { AppError } = require('../../middleware/errorHandler');

/**
 * Standard API response helper ensuring consistent payload envelopes across all services.
 *
 * @param {object} res        - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {*}      data       - Payload data
 * @param {object} req        - Express request object
 */
function sendResponse(res, statusCode, data, req) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      request_id: req.id || req.headers['x-request-id'] || 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * POST /api/v1/claims
 * File a new claim against an announced parametric trigger event.
 *
 * Returns 202 Accepted with claim_id, status ('filed'), and stream_url.
 */
async function fileClaim(req, res, next) {
  try {
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && (req.auth.tenant_id || req.auth.tenantId);

    if (!workerId || !tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Valid worker credentials and tenant context required');
    }

    const { trigger_event_id, policy_id, gps_lat, gps_lng } = req.body;

    const gps = (gps_lat !== undefined && gps_lng !== undefined)
      ? { lat: Number(gps_lat), lng: Number(gps_lng) }
      : null;

    const claim = await claimsService.fileClaim(
      tenantId,
      workerId,
      trigger_event_id,
      policy_id,
      gps
    );

    const responseData = {
      claim_id: claim.id,
      id: claim.id,
      status: claim.status,
      requested_amount: Number(claim.requestedAmount || 0),
      stream_url: `/api/v1/claims/${claim.id}/stream`,
      created_at: claim.createdAt,
    };

    return sendResponse(res, 202, responseData, req);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/claims
 * List claims filed by the authenticated worker.
 */
async function listWorkerClaims(req, res, next) {
  try {
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && (req.auth.tenant_id || req.auth.tenantId);

    if (!workerId || !tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Valid worker credentials required');
    }

    const result = await claimsService.listWorkerClaims(tenantId, workerId, req.query);
    return sendResponse(res, 200, result, req);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/claims/:id
 * Retrieve comprehensive claim detail with state timeline.
 * Workers see safe view (fraud scores redacted); Admins see full details.
 */
async function getClaimById(req, res, next) {
  try {
    const userId = req.auth && req.auth.sub;
    const role = req.auth && req.auth.role;
    const tenantId = req.auth && (req.auth.tenant_id || req.auth.tenantId);
    const isAdmin = role === 'admin';

    const claim = await claimsService.getClaimById(
      tenantId,
      req.params.id,
      isAdmin,
      isAdmin ? null : userId
    );

    return sendResponse(res, 200, claim, req);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/claims/:id/status
 * Lightweight status check for high-frequency polling or polling fallback.
 */
async function getClaimStatus(req, res, next) {
  try {
    const userId = req.auth && req.auth.sub;
    const role = req.auth && req.auth.role;
    const tenantId = req.auth && (req.auth.tenant_id || req.auth.tenantId);
    const isAdmin = role === 'admin';

    const status = await claimsService.getClaimStatus(
      tenantId,
      req.params.id,
      isAdmin ? null : userId
    );

    return sendResponse(res, 200, status, req);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/claims/:id/dispute
 * Worker files a dispute within the 2-hour window following payout.
 */
async function disputeClaim(req, res, next) {
  try {
    const workerId = req.auth && req.auth.sub;
    const tenantId = req.auth && (req.auth.tenant_id || req.auth.tenantId);

    if (!workerId || !tenantId) {
      throw new AppError('UNAUTHORIZED', 401, 'Valid worker credentials required');
    }

    const { reason } = req.body;
    const dispute = await claimsService.disputeClaim(
      tenantId,
      workerId,
      req.params.id,
      reason
    );

    return sendResponse(res, 201, dispute, req);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/admin/claims/queue
 * Admin review queue of held claims, ordered by review_priority DESC.
 */
async function getAdminReviewQueue(req, res, next) {
  try {
    const tenantId = (req.auth && (req.auth.tenant_id || req.auth.tenantId)) || req.query.tenant_id;
    const result = await getReviewQueue(tenantId, req.query);
    return sendResponse(res, 200, result, req);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/claims/:id/review
 * Admin reviews a held claim (approve / reject / partial).
 */
async function adminReviewClaim(req, res, next) {
  try {
    const adminId = req.auth && req.auth.sub;
    const tenantId = req.auth && (req.auth.tenant_id || req.auth.tenantId);

    const result = await claimsService.reviewClaim(
      tenantId,
      req.params.id,
      adminId,
      req.body
    );

    return sendResponse(res, 200, result, req);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/disputes/:id/resolve
 * Admin resolves a dispute (uphold with adjustment or reject).
 */
async function adminResolveDispute(req, res, next) {
  try {
    const adminId = req.auth && req.auth.sub;
    const tenantId = req.auth && (req.auth.tenant_id || req.auth.tenantId);

    const result = await claimsService.resolveDispute(
      tenantId,
      req.params.id,
      adminId,
      req.body
    );

    return sendResponse(res, 200, result, req);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/admin/analytics/tenant
 * Tenant-level analytics for claims, payouts, and fraud metrics.
 */
async function getAdminTenantAnalytics(req, res, next) {
  try {
    const tenantId = (req.auth && (req.auth.tenant_id || req.auth.tenantId)) || req.query.tenant_id;
    const analytics = await claimsService.getTenantAnalytics(tenantId);
    return sendResponse(res, 200, analytics, req);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  fileClaim,
  listWorkerClaims,
  getClaimById,
  getClaimStatus,
  disputeClaim,
  getAdminReviewQueue,
  adminReviewClaim,
  adminResolveDispute,
  getAdminTenantAnalytics,
};
