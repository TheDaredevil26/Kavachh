'use strict';

const winston = require('winston');
const path = require('path');

const SENSITIVE_FIELDS = new Set([
  'password',
  'aadhaar',
  'pan',
  'bank_account',
  'token',
  'refresh_token',
  'qr_payload',
]);

/**
 * Recursively redact sensitive fields from a log object.
 */
function redact(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redact);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      cleaned[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = redact(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

const redactFormat = winston.format((info) => {
  // Redact any object-type properties
  for (const key of Object.keys(info)) {
    if (typeof info[key] === 'object' && info[key] !== null) {
      info[key] = redact(info[key]);
    }
  }
  // Also redact the message if it looks like a sensitive value
  if (typeof info.message === 'string') {
    for (const field of SENSITIVE_FIELDS) {
      const regex = new RegExp(`"${field}"\\s*:\\s*"[^"]*"`, 'gi');
      info.message = info.message.replace(regex, `"${field}":"***REDACTED***"`);
    }
  }
  return info;
});

const logsDir = path.resolve(__dirname, '../../../logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    redactFormat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'kavach' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} [${service}] ${level}: ${message}${extra}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

module.exports = logger;
