'use strict';

const Joi = require('joi');

/* ──────────────── Auth ──────────────── */

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  phone_number: Joi.string().pattern(/^(\+91)?[6-9]\d{9}$/).required()
    .messages({ 'string.pattern.base': 'Phone must be a valid Indian mobile number (e.g. 9876543210 or +919876543210)' }),
  password: Joi.string().min(8).max(128).required(),
  tenant_slug: Joi.string().valid('blinkit', 'zepto', 'swiggy_instamart').required(),
  platform_worker_id: Joi.string().min(1).max(100).required(),
  zone_id: Joi.string().min(1).max(50).required(),
  current_city: Joi.string().max(100).optional(),
  state: Joi.string().max(100).optional(),
  email: Joi.string().email().optional(),
  date_of_birth: Joi.date().iso().optional(),
  aadhaar_number: Joi.string().optional(),
  pan_number: Joi.string().optional(),
  bank_account_number: Joi.string().optional(),
  bank_ifsc_code: Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
  account_holder_name: Joi.string().optional(),
});

const loginSchema = Joi.object({
  phone_number: Joi.string().pattern(/^(\+91)?[6-9]\d{9}$/).required()
    .messages({ 'string.pattern.base': 'Phone must be a valid Indian mobile number' }),
  password: Joi.string().required(),
});

const refreshTokenSchema = Joi.object({
  refresh_token: Joi.string().required(),
});

/* ──────────────── Policy ──────────────── */

const buyPolicySchema = Joi.object({
  tier: Joi.number().integer().valid(1, 2, 3).required(),
  auto_renew: Joi.boolean().default(true),
});

/* ──────────────── Claims ──────────────── */

const fileClaimSchema = Joi.object({
  trigger_event_id: Joi.string().uuid().required(),
  policy_id: Joi.string().uuid().required(),
  gps_lat: Joi.number().min(-90).max(90).optional(),
  gps_lng: Joi.number().min(-180).max(180).optional(),
});

const disputeSchema = Joi.object({
  reason: Joi.string().min(10).max(1000).required(),
});

const adminReviewSchema = Joi.object({
  decision: Joi.string().valid('approve', 'reject', 'partial').required(),
  review_notes: Joi.string().max(1000).optional(),
  payout_percentage: Joi.number().min(0).max(100).when('decision', {
    is: 'approve',
    then: Joi.number().default(100),
  }),
});

const adminDisputeResolveSchema = Joi.object({
  decision: Joi.string().valid('uphold', 'reject').required(),
  resolution_notes: Joi.string().max(1000).optional(),
  adjustment_amount: Joi.number().positive().optional(),
});

/* ──────────────── GPS / Check-in ──────────────── */

const gpsUploadSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracy_meters: Joi.number().positive().optional(),
  timestamp: Joi.date().iso().required(),
});

const qrCheckinSchema = Joi.object({
  qr_payload: Joi.string().required(),
  device_lat: Joi.number().min(-90).max(90).required(),
  device_lng: Joi.number().min(-180).max(180).required(),
});

/* ──────────────── Trigger ──────────────── */

const simulateTriggerSchema = Joi.object({
  trigger_type: Joi.string().valid('rainfall', 'heat', 'aqi', 'curfew', 'platform_outage').required(),
  zone_id: Joi.string().min(1).max(50).required(),
  actual_value: Joi.number().required(),
  severity: Joi.string().valid('low', 'medium', 'high').default('medium'),
  duration_minutes: Joi.number().integer().positive().optional(),
  tenant_id: Joi.string().uuid().optional(),
});

/* ──────────────── Worker Profile ──────────────── */

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  email: Joi.string().email().optional(),
  current_city: Joi.string().max(100).optional(),
  state: Joi.string().max(100).optional(),
  bank_account_number: Joi.string().optional(),
  bank_ifsc_code: Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
  account_holder_name: Joi.string().optional(),
}).min(1);

const bankVerifySchema = Joi.object({
  bank_account_number: Joi.string().required(),
  bank_ifsc_code: Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).required(),
  account_holder_name: Joi.string().required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  buyPolicySchema,
  fileClaimSchema,
  disputeSchema,
  adminReviewSchema,
  adminDisputeResolveSchema,
  gpsUploadSchema,
  qrCheckinSchema,
  simulateTriggerSchema,
  updateProfileSchema,
  bankVerifySchema,
};
