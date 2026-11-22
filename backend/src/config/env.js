'use strict';

const path = require('path');
const Joi = require('joi');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const schema = Joi.object({
  DATABASE_URL: Joi.string().uri().required(),
  MONGO_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  REFRESH_TTL_DAYS: Joi.number().integer().default(7),
  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  GOOGLE_OIDC_CLIENT_ID: Joi.string().default(''),
  GOOGLE_OIDC_CLIENT_SECRET: Joi.string().default(''),
  OAUTH_REDIRECT_BASE: Joi.string().uri().default('http://localhost:8000'),
  MOCK_PLATFORM_OAUTH_URL: Joi.string().default('http://localhost:9000/oauth'),
  OWM_API_KEY: Joi.string().default(''),
  ML_SERVICE_URL: Joi.string().uri().default('http://localhost:5000'),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
  PORT: Joi.number().integer().default(8000),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false, stripUnknown: false });

if (error) {
  const details = error.details.map((d) => `  - ${d.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Environment validation failed:\n${details}`);
  process.exit(1);
}

const env = {
  DATABASE_URL: value.DATABASE_URL,
  MONGO_URL: value.MONGO_URL,
  REDIS_HOST: value.REDIS_HOST,
  REDIS_PORT: value.REDIS_PORT,
  JWT_SECRET: value.JWT_SECRET,
  JWT_ACCESS_EXPIRY: value.JWT_ACCESS_EXPIRY,
  REFRESH_TTL_DAYS: value.REFRESH_TTL_DAYS,
  ENCRYPTION_KEY: value.ENCRYPTION_KEY,
  GOOGLE_OIDC_CLIENT_ID: value.GOOGLE_OIDC_CLIENT_ID,
  GOOGLE_OIDC_CLIENT_SECRET: value.GOOGLE_OIDC_CLIENT_SECRET,
  OAUTH_REDIRECT_BASE: value.OAUTH_REDIRECT_BASE,
  MOCK_PLATFORM_OAUTH_URL: value.MOCK_PLATFORM_OAUTH_URL,
  OWM_API_KEY: value.OWM_API_KEY,
  ML_SERVICE_URL: value.ML_SERVICE_URL,
  NODE_ENV: value.NODE_ENV,
  LOG_LEVEL: value.LOG_LEVEL,
  PORT: value.PORT,
  isDev: value.NODE_ENV === 'development',
  isProd: value.NODE_ENV === 'production',
  isTest: value.NODE_ENV === 'test',
};

module.exports = env;
