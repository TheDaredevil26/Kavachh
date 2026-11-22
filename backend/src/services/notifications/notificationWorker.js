'use strict';

const { Worker } = require('bullmq');
let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch (_) {
  const crypto = require('crypto');
  uuidv4 = crypto.randomUUID ? crypto.randomUUID.bind(crypto) : () => crypto.randomBytes(16).toString('hex');
}
const { redis } = require('../../config/redis');
const prisma = require('../../db/prisma');
const logger = require('../../utils/logger');

const connection = { host: redis.options.host, port: redis.options.port };

/**
 * Mock SMS dispatch service.
 * Simulates telecom SMS delivery with structured logging.
 *
 * @param {object} params
 * @param {string} params.phoneNumber - Recipient phone number
 * @param {string} params.message     - SMS body text
 * @param {string} [params.title]     - SMS title / header
 * @returns {Promise<object>} Dispatch result
 */
async function sendMockSms({ phoneNumber, message, title }) {
  const messageId = `sms-${uuidv4()}`;
  logger.info('📱 [MOCK SMS DISPATCHED]', {
    messageId,
    to: phoneNumber || 'unknown',
    title: title || 'Kavach Alert',
    message,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    provider: 'mock-sms-gateway',
    messageId,
    status: 'delivered',
    deliveredAt: new Date(),
  };
}

/**
 * Mock Firebase Cloud Messaging (FCM) push notification service.
 * Simulates mobile app push notifications.
 *
 * @param {object} params
 * @param {string} params.workerId  - Worker identifier
 * @param {string} params.title     - Push notification title
 * @param {string} params.body      - Push notification body
 * @param {object} [params.data]    - Extra payload data
 * @returns {Promise<object>} Dispatch result
 */
async function sendMockFcm({ workerId, title, body, data }) {
  const messageId = `fcm-${uuidv4()}`;
  logger.info('🔔 [MOCK FCM DISPATCHED]', {
    messageId,
    workerId,
    title,
    body,
    data: data || {},
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    provider: 'mock-firebase-cloud-messaging',
    messageId,
    status: 'delivered',
    deliveredAt: new Date(),
  };
}

/**
 * Normalizes notification content for supported types:
 * - pre_alert
 * - claim_approved
 * - claim_held
 * - payout_sent
 * - dispute_update
 *
 * @param {string} type
 * @param {object} data
 * @returns {{ title: string, body: string, channel: string }}
 */
function buildNotificationContent(type, data) {
  const normalizedType = (type || '').toLowerCase().trim();

  let title = data.title;
  let body = data.message || data.body;
  const channel = data.channel || 'sms';

  switch (normalizedType) {
    case 'pre_alert':
      title = title || '⚠️ Adverse Weather Pre-Alert';
      body = body || `Severe weather forecasted in your zone (${data.zoneId || data.metadata?.zoneId || 'Indiranagar'}). Your Kavach parametric protection is active.`;
      break;

    case 'claim_approved':
      title = title || '✅ Claim Approved';
      body = body || `Your Kavach claim #${data.claimId || ''} for ₹${data.amount || data.payoutAmount || 300} has been approved.`;
      break;

    case 'claim_held':
      title = title || '⏳ Claim Under Verification';
      body = body || `Your Kavach claim #${data.claimId || ''} is held for manual verification. A platform reviewer is assessing the telemetry.`;
      break;

    case 'payout_sent':
      title = title || '💸 Payout Sent';
      body = body || `₹${data.amount || 300} has been initiated to your bank account for claim #${data.claimId || ''}. UTR: ${data.utr || 'MOCK-' + Date.now()}.`;
      break;

    case 'dispute_update':
      title = title || '📝 Claim Dispute Update';
      body = body || `Your dispute on claim #${data.claimId || data.disputeId || ''} has been updated: ${data.status || 'Under review by operations'}.`;
      break;

    case 'policy_renewed':
    case 'policy-renewed':
      title = title || '🔄 Policy Auto-Renewed';
      body = body || `Your Kavach weekly coverage has been renewed for another 7 days.`;
      break;

    default:
      title = title || `Kavach Notification`;
      body = body || `You have a new update regarding your Kavach account.`;
      break;
  }

  return { title, body, channel };
}

/**
 * Core processor for notification queue jobs.
 *
 * @param {import('bullmq').Job} job
 * @returns {Promise<object>}
 */
async function processNotificationJob(job) {
  const { data } = job;
  const rawType = data.type || data.notificationType || job.name || 'general';
  const workerId = data.workerId;
  let tenantId = data.tenantId;

  logger.info('Processing notification job', {
    jobId: job.id,
    type: rawType,
    workerId,
    tenantId,
  });

  if (!workerId) {
    logger.error('Notification job missing workerId', { jobId: job.id });
    return { success: false, reason: 'MISSING_WORKER_ID' };
  }

  // Look up worker if needed to get phone number and resolve tenant
  let phoneNumber = data.phoneNumber;
  try {
    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { phoneNumber: true, tenantId: true, name: true },
    });

    if (worker) {
      if (!phoneNumber) {
        phoneNumber = worker.phoneNumber;
      }
      if (!tenantId) {
        tenantId = worker.tenantId;
      }
    }
  } catch (err) {
    logger.warn('Failed to query worker record for notification', { workerId, error: err.message });
  }

  const { title, body, channel } = buildNotificationContent(rawType, data);
  const metadata = data.metadata || (data.claimId ? { claimId: data.claimId, amount: data.amount } : null);

  // 1. Dispatch through mock channels
  let dispatchResult = null;
  if (channel === 'fcm' || channel === 'push') {
    dispatchResult = await sendMockFcm({
      workerId,
      title,
      body,
      data: metadata || {},
    });
  } else if (channel === 'both') {
    const [smsRes, fcmRes] = await Promise.all([
      sendMockSms({ phoneNumber, message: body, title }),
      sendMockFcm({ workerId, title, body, data: metadata || {} }),
    ]);
    dispatchResult = { sms: smsRes, fcm: fcmRes };
  } else {
    // Default: SMS
    dispatchResult = await sendMockSms({
      phoneNumber,
      message: body,
      title,
    });
  }

  // 2. Persist in database notification_log table
  let logRecord = null;
  try {
    logRecord = await prisma.notificationLog.create({
      data: {
        tenantId: tenantId || null,
        workerId,
        notificationType: rawType,
        channel: channel,
        title,
        body,
        status: 'sent',
        metadata: metadata ? (typeof metadata === 'object' ? metadata : { raw: metadata }) : null,
      },
    });

    logger.info('Logged notification to database', {
      notificationLogId: logRecord.id,
      workerId,
      type: rawType,
    });
  } catch (dbErr) {
    logger.error('Failed to write to notification_log table', {
      workerId,
      error: dbErr.message,
    });
  }

  // 3. Publish real-time event via Redis pub/sub for SSE stream subscribers
  try {
    await redis.publish(
      'evt:notifications',
      JSON.stringify({
        event: 'notification',
        type: rawType,
        workerId,
        tenantId,
        title,
        body,
        channel,
        logId: logRecord ? logRecord.id : null,
        timestamp: new Date().toISOString(),
        metadata,
      })
    );
  } catch (pubErr) {
    logger.warn('Failed to publish notification to Redis pub/sub', { error: pubErr.message });
  }

  return {
    success: true,
    notificationLogId: logRecord ? logRecord.id : null,
    dispatchResult,
  };
}

/**
 * BullMQ Worker instance processing jobs on 'notifications' queue.
 */
const notificationWorker = new Worker('notifications', processNotificationJob, {
  connection,
  concurrency: 10,
});

notificationWorker.on('completed', (job, result) => {
  logger.info(`Notification job ${job.id} completed successfully`, {
    jobId: job.id,
    type: job.name,
    result,
  });
});

notificationWorker.on('failed', (job, err) => {
  logger.error(`Notification job ${job ? job.id : 'unknown'} failed`, {
    jobId: job ? job.id : undefined,
    error: err.message,
    stack: err.stack,
  });
});

notificationWorker.on('error', (err) => {
  logger.error('Notification worker connection error', { error: err.message });
});

module.exports = {
  notificationWorker,
  processNotificationJob,
  sendMockSms,
  sendMockFcm,
  buildNotificationContent,
};
