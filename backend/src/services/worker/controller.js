'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../../db/prisma');
const { forTenant } = require('../../db/tenantClient');
const { GpsPing, DarkStoreCheckin } = require('../../db/mongo');
const { issueTokens, refreshToken } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');
const { encrypt, decrypt } = require('../../utils/encryption');
const { verifyQrPayload } = require('../../utils/qr');
const { haversineDistance } = require('../../utils/geo');
const { generateAuthorize, handleCallback } = require('../../auth/platformOAuth');
const logger = require('../../utils/logger');

/**
 * Standard API response helper.
 *
 * @param {object} res - Express response
 * @param {number} statusCode - HTTP status code
 * @param {object} data - Response payload
 * @param {object} req - Express request
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
 * Decrypt a PII string safely, returning null if empty or decryption fails.
 *
 * @param {string|null} encryptedStr
 * @returns {string|null}
 */
function safeDecrypt(encryptedStr) {
  if (!encryptedStr) return null;
  try {
    return decrypt(encryptedStr);
  } catch (err) {
    logger.warn('Failed to decrypt PII field', { error: err.message });
    return null;
  }
}

/**
 * Formats a worker profile object for API responses, decrypting PII fields.
 *
 * @param {object} worker - Worker record from Prisma
 * @returns {object} Formatted worker profile
 */
function formatWorkerProfile(worker) {
  return {
    id: worker.id,
    worker_id: worker.id,
    tenant_id: worker.tenantId || worker.tenant_id,
    name: worker.name,
    phone_number: worker.phoneNumber || worker.phone_number,
    phoneNumber: worker.phoneNumber || worker.phone_number,
    email: worker.email,
    date_of_birth: worker.dateOfBirth || worker.date_of_birth,
    platform_worker_id: worker.platformWorkerId || worker.platform_worker_id,
    platformWorkerId: worker.platformWorkerId || worker.platform_worker_id,
    platform_oauth_subject: worker.platformOauthSubject || worker.platform_oauth_subject,
    platform_verified_at: worker.platformVerifiedAt || worker.platform_verified_at,
    zone_id: worker.zoneId || worker.zone_id,
    current_city: worker.currentCity || worker.current_city,
    state: worker.state,
    kyc_verified: worker.kycVerified ?? worker.kyc_verified ?? false,
    kyc_verified_at: worker.kycVerifiedAt || worker.kyc_verified_at,
    bank_verification_status: worker.bankVerificationStatus || worker.bank_verification_status || 'pending',
    aadhaar_number: safeDecrypt(worker.aadhaarNumber || worker.aadhaar_number),
    pan_number: safeDecrypt(worker.panNumber || worker.pan_number),
    bank_account_number: safeDecrypt(worker.bankAccountNumber || worker.bank_account_number),
    bank_ifsc_code: safeDecrypt(worker.bankIfscCode || worker.bank_ifsc_code),
    account_holder_name: safeDecrypt(worker.accountHolderName || worker.account_holder_name),
    status: worker.status || 'active',
    created_at: worker.createdAt || worker.created_at,
    updated_at: worker.updatedAt || worker.updated_at,
    last_active_at: worker.lastActiveAt || worker.last_active_at,
  };
}

/**
 * Compute GPS jitter (stddev of distances from centroid in meters)
 * from an array of GPS reading objects.
 *
 * @param {Array<object>} points - Array of recent GPS readings
 * @returns {number} Standard deviation in meters rounded to 4 decimals
 */
function computeGpsJitter(points) {
  if (!points || points.length < 2) {
    return 0;
  }

  const coords = points.map((p) => {
    if (p.location && Array.isArray(p.location.coordinates)) {
      return { lng: p.location.coordinates[0], lat: p.location.coordinates[1] };
    }
    return { lng: p.longitude ?? p.lng, lat: p.latitude ?? p.lat };
  });

  const n = coords.length;
  const meanLat = coords.reduce((sum, c) => sum + c.lat, 0) / n;
  const meanLng = coords.reduce((sum, c) => sum + c.lng, 0) / n;

  // Haversine distance in meters from centroid for each reading
  const distances = coords.map((c) => haversineDistance(c.lat, c.lng, meanLat, meanLng) * 1000);
  const meanDist = distances.reduce((sum, d) => sum + d, 0) / n;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDist, 2), 0) / n;
  const stddev = Math.sqrt(variance);

  return Math.round(stddev * 10000) / 10000;
}

/**
 * Register a new worker.
 * POST /api/v1/auth/register
 */
async function register(req, res, next) {
  try {
    const {
      name,
      phone_number,
      password,
      tenant_slug,
      platform_worker_id,
      zone_id,
      current_city,
      state,
      email,
      date_of_birth,
      aadhaar_number,
      pan_number,
      bank_account_number,
      bank_ifsc_code,
      account_holder_name,
    } = req.body;

    // 1. Find tenant by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenant_slug },
    });
    if (!tenant) {
      throw new AppError('TENANT_NOT_FOUND', 404, `Tenant '${tenant_slug}' not found`);
    }
    if (!tenant.isActive) {
      throw new AppError('TENANT_INACTIVE', 403, `Tenant '${tenant_slug}' is inactive`);
    }

    // 2. Check if phone number is already registered
    const normalizedPhone = phone_number.startsWith('+91')
      ? phone_number
      : `+91${phone_number}`;
    const rawPhone = phone_number.replace(/^\+91/, '');

    const existingPhone = await prisma.worker.findFirst({
      where: {
        phoneNumber: { in: [normalizedPhone, rawPhone, phone_number] },
      },
    });
    if (existingPhone) {
      throw new AppError('WORKER_ALREADY_EXISTS', 409, 'Worker with this phone number is already registered');
    }

    // 3. Check if platform_worker_id is already registered for this tenant
    const existingPlatformWorker = await prisma.worker.findFirst({
      where: {
        tenantId: tenant.id,
        platformWorkerId: platform_worker_id,
      },
    });
    if (existingPlatformWorker) {
      throw new AppError('WORKER_ALREADY_EXISTS', 409, 'Platform worker ID already registered for this tenant');
    }

    // 4. Hash password with bcrypt 12 rounds
    const passwordHash = await bcrypt.hash(password, 12);

    // 5. Encrypt PII fields (aadhaar, pan, bank_account, ifsc, account_holder_name)
    const encryptedAadhaar = aadhaar_number ? encrypt(aadhaar_number) : null;
    const encryptedPan = pan_number ? encrypt(pan_number) : null;
    const encryptedBankAccount = bank_account_number ? encrypt(bank_account_number) : null;
    const encryptedIfsc = bank_ifsc_code ? encrypt(bank_ifsc_code) : null;
    const encryptedAccountHolder = account_holder_name ? encrypt(account_holder_name) : null;

    // 6. Create worker via Prisma
    const worker = await prisma.worker.create({
      data: {
        tenantId: tenant.id,
        name,
        phoneNumber: normalizedPhone,
        passwordHash,
        platformWorkerId: platform_worker_id,
        zoneId: zone_id,
        currentCity: current_city || null,
        state: state || null,
        email: email || null,
        dateOfBirth: date_of_birth ? new Date(date_of_birth) : null,
        aadhaarNumber: encryptedAadhaar,
        panNumber: encryptedPan,
        bankAccountNumber: encryptedBankAccount,
        bankIfscCode: encryptedIfsc,
        accountHolderName: encryptedAccountHolder,
        registrationIpAddress: req.ip || req.headers['x-forwarded-for'] || null,
        registrationDeviceFingerprint: req.headers['x-device-fingerprint'] || null,
      },
    });

    // 7. Issue JWT tokens with { sub: worker.id, tenant_id: tenant.id, role: 'worker' }
    const tokens = await issueTokens({
      sub: worker.id,
      tenant_id: tenant.id,
      role: 'worker',
    });

    logger.info('Worker registered successfully', {
      workerId: worker.id,
      tenantSlug: tenant_slug,
      platformWorkerId: platform_worker_id,
    });

    // 8. Return 201 with worker_id, access_token, refresh_token, expires_in: 900
    return sendResponse(
      res,
      201,
      {
        worker_id: worker.id,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: 900,
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Worker login.
 * POST /api/v1/auth/login
 */
async function login(req, res, next) {
  try {
    const { phone_number, password } = req.body;
    const normalizedPhone = phone_number.startsWith('+91')
      ? phone_number
      : `+91${phone_number}`;
    const rawPhone = phone_number.replace(/^\+91/, '');

    // 1. Find worker by phone (accept with or without +91)
    const worker = await prisma.worker.findFirst({
      where: {
        phoneNumber: { in: [normalizedPhone, rawPhone, phone_number] },
      },
    });
    if (!worker) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid phone number or password');
    }

    // 2. Bcrypt compare
    const isValidPassword = await bcrypt.compare(password, worker.passwordHash);
    if (!isValidPassword) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid phone number or password');
    }

    if (worker.status && worker.status !== 'active') {
      throw new AppError('ACCOUNT_INACTIVE', 403, 'Worker account is inactive or suspended');
    }

    // Update lastLoginAt and lastActiveAt
    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      },
    });

    // 3. Issue JWT tokens with { sub: worker.id, tenant_id: worker.tenantId, role: 'worker' }
    const tokens = await issueTokens({
      sub: worker.id,
      tenant_id: worker.tenantId,
      role: 'worker',
    });

    logger.info('Worker login successful', { workerId: worker.id });

    // 4. Return 200
    return sendResponse(
      res,
      200,
      {
        worker_id: worker.id,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: 900,
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh access token.
 * POST /api/v1/auth/refresh
 */
async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;

    const tokens = await refreshToken(refresh_token);

    return sendResponse(
      res,
      200,
      {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: 900,
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get authenticated worker profile (decrypts PII for display).
 * GET /api/v1/workers/me
 */
async function getProfile(req, res, next) {
  try {
    const workerId = req.auth.sub;
    const tenantId = req.auth.tenant_id;
    const db = forTenant(tenantId);

    const worker = await db.worker.findFirst({
      where: { id: workerId },
    });

    if (!worker) {
      throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found');
    }

    const profileData = formatWorkerProfile(worker);

    return sendResponse(res, 200, profileData, req);
  } catch (error) {
    next(error);
  }
}

/**
 * Update worker profile fields. Encrypts PII fields before save.
 * PUT /api/v1/workers/me
 */
async function updateProfile(req, res, next) {
  try {
    const workerId = req.auth.sub;
    const tenantId = req.auth.tenant_id;
    const db = forTenant(tenantId);

    const existingWorker = await db.worker.findFirst({
      where: { id: workerId },
    });

    if (!existingWorker) {
      throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found');
    }

    const {
      name,
      email,
      current_city,
      state,
      bank_account_number,
      bank_ifsc_code,
      account_holder_name,
    } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (current_city !== undefined) updateData.currentCity = current_city;
    if (state !== undefined) updateData.state = state;

    if (bank_account_number !== undefined) {
      updateData.bankAccountNumber = encrypt(bank_account_number);
      updateData.bankVerificationStatus = 'pending';
    }
    if (bank_ifsc_code !== undefined) {
      updateData.bankIfscCode = encrypt(bank_ifsc_code);
    }
    if (account_holder_name !== undefined) {
      updateData.accountHolderName = encrypt(account_holder_name);
    }
    updateData.lastActiveAt = new Date();

    const updatedWorker = await db.worker.update({
      where: { id: workerId },
      data: updateData,
    });

    const profileData = formatWorkerProfile(updatedWorker);

    return sendResponse(res, 200, profileData, req);
  } catch (error) {
    next(error);
  }
}

/**
 * Upload GPS snapshot.
 * Writes to MongoDB gps_pings and computes jitter (stddev of last 5 readings).
 * POST /api/v1/workers/me/gps
 */
async function uploadGps(req, res, next) {
  try {
    const { latitude, longitude, accuracy_meters, timestamp } = req.body;
    const workerId = req.auth.sub;
    const tenantId = req.auth.tenant_id;

    const recordedAt = new Date(timestamp);

    // 1. Write ping to MongoDB gps_pings collection
    const newPing = await GpsPing.create({
      worker_id: workerId,
      tenant_id: tenantId,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      accuracy_m: accuracy_meters || null,
      recorded_at: recordedAt,
      received_at: new Date(),
    });

    // 2. Fetch last 5 pings for jitter calculation
    const recentPings = await GpsPing.find({
      worker_id: workerId,
      tenant_id: tenantId,
    })
      .sort({ recorded_at: -1 })
      .limit(5)
      .lean();

    // 3. Compute jitter (stddev of last 5 readings in meters)
    const jitter = computeGpsJitter(recentPings);

    // 4. Update worker lastActiveAt in PostgreSQL
    const db = forTenant(tenantId);
    await db.worker.update({
      where: { id: workerId },
      data: { lastActiveAt: new Date() },
    });

    return sendResponse(
      res,
      201,
      {
        ping_id: newPing._id,
        worker_id: workerId,
        jitter,
        recorded_at: recordedAt.toISOString(),
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Verify worker bank account details.
 * Encrypts bank fields and sets bank_verification_status='verified'.
 * POST /api/v1/workers/me/bank-verify
 */
async function bankVerify(req, res, next) {
  try {
    const { bank_account_number, bank_ifsc_code, account_holder_name } = req.body;
    const workerId = req.auth.sub;
    const tenantId = req.auth.tenant_id;
    const db = forTenant(tenantId);

    const worker = await db.worker.findFirst({
      where: { id: workerId },
    });
    if (!worker) {
      throw new AppError('WORKER_NOT_FOUND', 404, 'Worker not found');
    }

    const encryptedAccount = encrypt(bank_account_number);
    const encryptedIfsc = encrypt(bank_ifsc_code);
    const encryptedHolder = encrypt(account_holder_name);

    await db.worker.update({
      where: { id: workerId },
      data: {
        bankAccountNumber: encryptedAccount,
        bankIfscCode: encryptedIfsc,
        accountHolderName: encryptedHolder,
        bankVerificationStatus: 'verified',
        lastActiveAt: new Date(),
      },
    });

    logger.info('Worker bank verified successfully', { workerId });

    return sendResponse(
      res,
      200,
      {
        worker_id: workerId,
        bank_verification_status: 'verified',
        verified_at: new Date().toISOString(),
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Dark store QR check-in.
 * Verifies QR payload signature, 5-min expiry, nonce uniqueness via MongoDB index,
 * verifies tenant matching, device location within 150m (haversine),
 * and writes to dark_store_checkins + gps_pings.
 * POST /api/v1/workers/me/checkin/qr
 */
async function checkinQr(req, res, next) {
  try {
    const { qr_payload, device_lat, device_lng } = req.body;
    const workerId = req.auth.sub;
    const tenantId = req.auth.tenant_id;

    // 1. Decode base64 QR payload to extract dark_store_id
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(qr_payload, 'base64').toString('utf8'));
    } catch (err) {
      throw new AppError('INVALID_QR', 400, 'Invalid QR payload format');
    }

    const { dark_store_id, nonce, issued_at } = decoded;
    if (!dark_store_id || !nonce || !issued_at) {
      throw new AppError('INVALID_QR', 400, 'Missing required fields in QR payload');
    }

    // 2. Fetch dark store to retrieve its qrSecret and location
    const darkStore = await prisma.darkStore.findUnique({
      where: { id: dark_store_id },
    });
    if (!darkStore) {
      throw new AppError('DARK_STORE_NOT_FOUND', 404, 'Dark store not found');
    }

    // 3. Verify QR signature and 5-min expiry using the store's qrSecret
    const verification = verifyQrPayload(qr_payload, darkStore.qrSecret);
    if (!verification.valid) {
      throw new AppError('INVALID_QR', 400, verification.error || 'Invalid or expired QR code');
    }

    // 4. Check worker tenant matches dark store tenant
    if (darkStore.tenantId !== tenantId) {
      throw new AppError('TENANT_MISMATCH', 403, 'Worker tenant does not match dark store tenant');
    }

    // 5. Check device location is within 150m of dark store (haversine)
    const storeLat = Number(darkStore.latitude);
    const storeLng = Number(darkStore.longitude);
    const distanceKm = haversineDistance(device_lat, device_lng, storeLat, storeLng);
    const distanceM = distanceKm * 1000;

    if (distanceM > 150) {
      throw new AppError(
        'LOCATION_MISMATCH',
        400,
        `Device is ${Math.round(distanceM)}m away from dark store (max allowed: 150m)`
      );
    }

    // 6. Record check-in in MongoDB dark_store_checkins (nonce uniqueness via unique index)
    let checkin;
    try {
      checkin = await DarkStoreCheckin.create({
        worker_id: workerId,
        tenant_id: tenantId,
        dark_store_id: darkStore.id,
        nonce,
        qr_payload,
        gps_lat: device_lat,
        gps_lng: device_lng,
        distance_to_store_m: Math.round(distanceM * 100) / 100,
        verified: true,
        checked_in_at: new Date(issued_at),
        received_at: new Date(),
      });
    } catch (err) {
      if (err.code === 11000 || (err.message && err.message.includes('duplicate key'))) {
        throw new AppError('QR_ALREADY_USED', 409, 'This QR code has already been scanned');
      }
      throw err;
    }

    // 7. Write GPS ping to MongoDB gps_pings
    await GpsPing.create({
      worker_id: workerId,
      tenant_id: tenantId,
      location: {
        type: 'Point',
        coordinates: [device_lng, device_lat],
      },
      accuracy_m: null,
      recorded_at: new Date(issued_at),
      received_at: new Date(),
    });

    // 8. Update worker's lastActiveAt in PostgreSQL
    const db = forTenant(tenantId);
    await db.worker.update({
      where: { id: workerId },
      data: { lastActiveAt: new Date() },
    });

    logger.info('Dark store QR check-in successful', {
      workerId,
      darkStoreId: darkStore.id,
      distanceMeters: Math.round(distanceM),
    });

    return sendResponse(
      res,
      200,
      {
        checkin_id: checkin._id,
        dark_store_id: darkStore.id,
        dark_store_name: darkStore.name,
        distance_meters: Math.round(distanceM * 100) / 100,
        verified: true,
        checked_in_at: checkin.checked_in_at,
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get notification log for authenticated worker.
 * GET /api/v1/workers/me/notifications
 */
async function getNotifications(req, res, next) {
  try {
    const workerId = req.auth.sub;
    const tenantId = req.auth.tenant_id;
    const db = forTenant(tenantId);

    const notifications = await db.notificationLog.findMany({
      where: {
        workerId,
      },
      orderBy: {
        sentAt: 'desc',
      },
      take: 50,
    });

    return sendResponse(
      res,
      200,
      {
        notifications,
        total: notifications.length,
      },
      req
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Start OAuth 2.0 PKCE flow for platform linking.
 * GET /api/v1/auth/platform/:tenantSlug/authorize
 */
async function platformAuthorize(req, res, next) {
  try {
    const { tenantSlug } = req.params;
    const workerId = req.auth ? req.auth.sub : null;
    const redirectUrl = await generateAuthorize(tenantSlug, workerId);

    return res.redirect(redirectUrl);
  } catch (error) {
    next(error);
  }
}

/**
 * Handle platform OAuth callback.
 * GET/POST /api/v1/auth/platform/:tenantSlug/callback
 */
async function platformCallback(req, res, next) {
  try {
    const code = req.query.code || req.body.code;
    const state = req.query.state || req.body.state;
    const workerId = req.auth ? req.auth.sub : null;

    const result = await handleCallback(code, state, workerId);

    return sendResponse(res, 200, result, req);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  refresh,
  getProfile,
  updateProfile,
  uploadGps,
  bankVerify,
  checkinQr,
  getNotifications,
  platformAuthorize,
  platformCallback,
};
