'use strict';

const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Kavach API Gateway',
    version: '1.0.0',
    description:
      'Parametric Insurance Platform for Gig Delivery Workers (Blinkit, Zepto, Swiggy Instamart) — Unified API Gateway and Event Stream Hub.',
    contact: {
      name: 'Kavach Platform Engineering',
      email: 'dev@kavach.local',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: 'http://localhost:8000',
      description: 'Unified API Gateway (Local)',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token (Bearer <token>)',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object', nullable: true },
          error: {
            type: 'object',
            nullable: true,
            properties: {
              code: { type: 'string', example: 'CLAIM_NOT_FOUND' },
              message: { type: 'string', example: 'Claim does not exist' },
            },
          },
          meta: {
            type: 'object',
            properties: {
              request_id: { type: 'string', example: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6' },
            },
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['name', 'phoneNumber', 'password', 'tenantSlug', 'platformWorkerId', 'zoneId'],
        properties: {
          name: { type: 'string', example: 'Ravi Kumar' },
          phoneNumber: { type: 'string', example: '+919876543210' },
          password: { type: 'string', format: 'password', example: 'SecurePassword123' },
          tenantSlug: { type: 'string', example: 'blinkit' },
          platformWorkerId: { type: 'string', example: 'BLK-98432' },
          zoneId: { type: 'string', example: 'blr_indiranagar' },
          email: { type: 'string', format: 'email', example: 'ravi@example.com' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['phoneNumber', 'password'],
        properties: {
          phoneNumber: { type: 'string', example: '+919876543210' },
          password: { type: 'string', format: 'password', example: 'SecurePassword123' },
        },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
          refreshToken: { type: 'string', example: 'a1b2c3d4e5...' },
        },
      },
      PolicyTier: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'tier_2' },
          name: { type: 'string', example: 'Standard Coverage' },
          weeklyPremium: { type: 'number', example: 49 },
          maxWeeklyPayout: { type: 'number', example: 1200 },
          coverages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                triggerType: { type: 'string', example: 'HEAVY_RAIN' },
                payoutAmount: { type: 'number', example: 300 },
              },
            },
          },
        },
      },
      BuyPolicyRequest: {
        type: 'object',
        required: ['tier'],
        properties: {
          tier: { type: 'string', enum: ['TIER_1', 'TIER_2', 'TIER_3'], example: 'TIER_2' },
          autoRenew: { type: 'boolean', default: true },
        },
      },
      FileClaimRequest: {
        type: 'object',
        required: ['triggerEventId', 'policyId'],
        properties: {
          triggerEventId: { type: 'string', format: 'uuid', example: '7d5a5700-4b21-4d37-97d8-cb15197f267a' },
          policyId: { type: 'string', format: 'uuid', example: '4b4e318f-9a43-4e4b-b5d1-16bfbe132890' },
          claimedAmount: { type: 'number', example: 350 },
        },
      },
      DisputeClaimRequest: {
        type: 'object',
        required: ['disputeReason'],
        properties: {
          disputeReason: { type: 'string', example: 'I was actively delivering during the rainfall.' },
          additionalEvidence: { type: 'object' },
        },
      },
      SimulateTriggerRequest: {
        type: 'object',
        required: ['triggerType', 'zoneId', 'severityValue'],
        properties: {
          triggerType: {
            type: 'string',
            enum: ['HEAVY_RAIN', 'EXTREME_HEAT', 'AQI_SEVERE', 'FLOOD', 'CIVIC_CURFEW'],
            example: 'HEAVY_RAIN',
          },
          zoneId: { type: 'string', example: 'blr_indiranagar' },
          severityValue: { type: 'number', example: 68.5 },
          metadata: { type: 'object' },
        },
      },
      NotificationPayload: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workerId: { type: 'string', format: 'uuid' },
          tenantId: { type: 'string', format: 'uuid' },
          notificationType: { type: 'string', example: 'pre_alert' },
          channel: { type: 'string', example: 'sms' },
          title: { type: 'string', example: 'Adverse Weather Alert' },
          body: { type: 'string', example: 'Heavy rain predicted in your zone.' },
          sentAt: { type: 'string', format: 'date-time' },
          status: { type: 'string', example: 'sent' },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Gateway Health Check',
        tags: ['System'],
        security: [],
        responses: {
          200: {
            description: 'Gateway is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'api-gateway' },
                    timestamp: { type: 'string' },
                    uptime: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/metrics': {
      get: {
        summary: 'Prometheus Metrics',
        tags: ['System'],
        security: [],
        responses: {
          200: {
            description: 'Prometheus metrics text format',
          },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'Register new gig worker',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
        },
        responses: {
          201: { description: 'Worker created & authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          400: { description: 'Validation error' },
          409: { description: 'Phone number already registered' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Worker login with phone and password',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: { description: 'Login successful, returns JWT tokens' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Refresh JWT access token',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Rotated token pair returned' },
          401: { description: 'Invalid or expired refresh token' },
        },
      },
    },
    '/api/v1/workers/me': {
      get: {
        summary: 'Get worker profile',
        tags: ['Worker'],
        responses: {
          200: { description: 'Decrypted worker profile details' },
          401: { description: 'Unauthorized' },
        },
      },
      put: {
        summary: 'Update worker profile',
        tags: ['Worker'],
        responses: {
          200: { description: 'Worker profile updated' },
        },
      },
    },
    '/api/v1/workers/me/gps': {
      post: {
        summary: 'Upload GPS telemetry ping',
        tags: ['Worker'],
        responses: {
          200: { description: 'GPS ping recorded' },
        },
      },
    },
    '/api/v1/workers/me/bank-verify': {
      post: {
        summary: 'Verify bank account and IFSC',
        tags: ['Worker'],
        responses: {
          200: { description: 'Bank verification submitted' },
        },
      },
    },
    '/api/v1/workers/me/checkin/qr': {
      post: {
        summary: 'Dark store QR check-in with geo-fencing (150m)',
        tags: ['Worker'],
        responses: {
          200: { description: 'Check-in verified and logged' },
        },
      },
    },
    '/api/v1/workers/me/notifications': {
      get: {
        summary: 'Get worker notification history',
        tags: ['Worker', 'Notifications'],
        responses: {
          200: { description: 'List of sent notifications' },
        },
      },
    },
    '/api/v1/policies/tiers': {
      get: {
        summary: 'List available insurance tiers (public)',
        tags: ['Policy'],
        security: [],
        responses: {
          200: { description: 'Static policy tiers (cached 24h)' },
        },
      },
    },
    '/api/v1/policies': {
      get: {
        summary: 'List policies owned by authenticated worker',
        tags: ['Policy'],
        responses: {
          200: { description: 'Active and past policies' },
        },
      },
      post: {
        summary: 'Buy a weekly insurance policy',
        tags: ['Policy'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BuyPolicyRequest' } } },
        },
        responses: {
          201: { description: 'Policy purchased with 5 trigger coverages' },
        },
      },
    },
    '/api/v1/policies/{id}': {
      get: {
        summary: 'Get policy details by ID',
        tags: ['Policy'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Policy detail with coverages' },
        },
      },
      delete: {
        summary: 'Cancel policy',
        tags: ['Policy'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Policy cancelled' },
        },
      },
    },
    '/api/v1/triggers/active': {
      get: {
        summary: 'Get active triggers for worker zone',
        tags: ['Trigger'],
        responses: {
          200: { description: 'Active announced triggers in worker zone' },
        },
      },
    },
    '/api/v1/triggers/history': {
      get: {
        summary: 'Get 30-day trigger history for worker zone',
        tags: ['Trigger'],
        responses: {
          200: { description: 'Historic trigger events' },
        },
      },
    },
    '/api/v1/admin/triggers/simulate': {
      post: {
        summary: 'Simulate environmental trigger (Admin only)',
        tags: ['Trigger', 'Admin'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SimulateTriggerRequest' } } },
        },
        responses: {
          201: { description: 'Trigger created and announced' },
        },
      },
    },
    '/api/v1/claims': {
      get: {
        summary: 'List claims for authenticated worker',
        tags: ['Claims'],
        responses: {
          200: { description: 'List of filed claims' },
        },
      },
      post: {
        summary: 'File a claim against an announced trigger',
        tags: ['Claims'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FileClaimRequest' } } },
        },
        responses: {
          202: { description: 'Claim accepted for automated evaluation' },
        },
      },
    },
    '/api/v1/claims/{id}': {
      get: {
        summary: 'Get claim details and transition timeline',
        tags: ['Claims'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Claim details' },
        },
      },
    },
    '/api/v1/claims/{id}/status': {
      get: {
        summary: 'Lightweight claim status polling endpoint',
        tags: ['Claims'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Claim state and updated timestamp' },
        },
      },
    },
    '/api/v1/claims/{id}/dispute': {
      post: {
        summary: 'Dispute a claim settlement within the 2-hour window',
        tags: ['Claims'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DisputeClaimRequest' } } },
        },
        responses: {
          201: { description: 'Dispute submitted for admin review' },
        },
      },
    },
    '/api/v1/admin/claims/queue': {
      get: {
        summary: 'List held claims in admin review queue',
        tags: ['Admin', 'Claims'],
        responses: {
          200: { description: 'Claims awaiting manual review' },
        },
      },
    },
    '/api/v1/admin/claims/{id}/review': {
      post: {
        summary: 'Manual review decision for held claim',
        tags: ['Admin', 'Claims'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Review decision applied' },
        },
      },
    },
    '/api/v1/admin/disputes/{id}/resolve': {
      post: {
        summary: 'Resolve worker claim dispute',
        tags: ['Admin', 'Claims'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Dispute resolved' },
        },
      },
    },
    '/api/v1/admin/analytics/tenant': {
      get: {
        summary: 'Tenant analytics (claims, payouts, loss ratio, fraud rate)',
        tags: ['Admin'],
        responses: {
          200: { description: 'Tenant aggregated analytics metrics' },
        },
      },
    },
    '/api/v1/notifications': {
      get: {
        summary: 'List system notifications',
        tags: ['Notifications'],
        responses: {
          200: { description: 'Recent notifications log' },
        },
      },
    },
    '/api/v1/notifications/send': {
      post: {
        summary: 'Dispatch or enqueue a notification',
        tags: ['Notifications'],
        responses: {
          202: { description: 'Notification enqueued' },
        },
      },
    },
    '/stream/claims/{id}': {
      get: {
        summary: 'SSE Stream for Claim Updates',
        tags: ['Streams'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'token', in: 'query', required: false, schema: { type: 'string' }, description: 'JWT token for EventSource' },
        ],
        responses: {
          200: { description: 'text/event-stream connection opened' },
        },
      },
    },
    '/stream/worker': {
      get: {
        summary: 'SSE Stream for Authenticated Worker Alerts',
        tags: ['Streams'],
        parameters: [
          { name: 'token', in: 'query', required: false, schema: { type: 'string' }, description: 'JWT token for EventSource' },
        ],
        responses: {
          200: { description: 'text/event-stream connection opened' },
        },
      },
    },
    '/stream/admin': {
      get: {
        summary: 'SSE Stream for Admin Events',
        tags: ['Streams'],
        parameters: [
          { name: 'token', in: 'query', required: false, schema: { type: 'string' }, description: 'JWT token for EventSource' },
        ],
        responses: {
          200: { description: 'text/event-stream connection opened' },
        },
      },
    },
  },
};

const swaggerOptions = {
  swaggerDefinition,
  apis: [
    path.join(__dirname, './*.js'),
    path.join(__dirname, '../services/**/*.js'),
    path.join(__dirname, '../auth/*.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

/**
 * Configure and mount Swagger UI and OpenAPI JSON spec routes on an Express app.
 *
 * @param {import('express').Application} app
 */
function setupSwagger(app) {
  // Serve OpenAPI JSON schema
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Serve Swagger UI documentation
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customSiteTitle: 'Kavach API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
      },
    })
  );
}

module.exports = {
  swaggerSpec,
  swaggerUi,
  setupSwagger,
};
