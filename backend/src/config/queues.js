'use strict';

const { Queue, QueueEvents } = require('bullmq');
const { redis } = require('./redis');
const logger = require('../utils/logger');

const connection = { host: redis.options.host, port: redis.options.port };

const QUEUE_NAMES = [
  'claim-validate',
  'fraud-eval',
  'payout',
  'close-claim',
  'trigger',
  'notifications',
  'policy-renew',
];

const queues = {};

for (const name of QUEUE_NAMES) {
  queues[name] = new Queue(name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  });

  const events = new QueueEvents(name, { connection });

  events.on('failed', ({ jobId, failedReason }) => {
    logger.error(`Job failed in queue "${name}"`, { jobId, failedReason, queue: name });
  });

  events.on('stalled', ({ jobId }) => {
    logger.warn(`Job stalled in queue "${name}"`, { jobId, queue: name });
  });
}

module.exports = queues;
