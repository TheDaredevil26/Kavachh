'use strict';

describe('Gateway & Notifications Unit Tests', () => {
  describe('1. RequestId Middleware', () => {
    const requestIdMiddleware = require('../../src/middleware/requestId');

    test('generates uuid when x-request-id header is absent', () => {
      const req = { headers: {} };
      const res = {
        headers: {},
        setHeader(name, val) {
          this.headers[name] = val;
        },
      };
      let calledNext = false;

      requestIdMiddleware(req, res, () => {
        calledNext = true;
      });

      expect(calledNext).toBe(true);
      expect(req.id).toBeDefined();
      expect(req.requestId).toBe(req.id);
      expect(req.request_id).toBe(req.id);
      expect(res.headers['X-Request-Id']).toBe(req.id);
    });

    test('reuses existing x-request-id header', () => {
      const incomingId = 'custom-request-uuid-1234';
      const req = { headers: { 'x-request-id': incomingId } };
      const res = {
        headers: {},
        setHeader(name, val) {
          this.headers[name] = val;
        },
      };

      requestIdMiddleware(req, res, () => {});

      expect(req.id).toBe(incomingId);
      expect(req.requestId).toBe(incomingId);
      expect(res.headers['X-Request-Id']).toBe(incomingId);
    });
  });

  describe('2. SseHub', () => {
    const { SseHub } = require('../../src/gateway/sseHub');

    test('subscribes client, sets headers, and delivers published events', () => {
      const hub = new SseHub({ maxConnectionsPerUser: 3, heartbeatMs: 1000 });
      const channel = 'claim:test-uuid-1';
      const userId = 'user-123';

      const written = [];
      const res = {
        writeHead: jest.fn(),
        write: (chunk) => written.push(chunk),
        flushHeaders: jest.fn(),
        on: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn(),
      };
      const req = {
        headers: {},
        on: jest.fn(),
      };

      const client = hub.subscribe(channel, userId, req, res);

      expect(client).toBeDefined();
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      }));
      expect(written[0]).toBe(': connected\n\n');

      // Publish event
      const delivered = hub.publish(channel, 'claim_evaluated', { status: 'approved', amount: 300 });
      expect(delivered).toBe(1);
      expect(written[1]).toContain('event: claim_evaluated\n');
      expect(written[1]).toContain('"status":"approved"');

      // Clean up
      hub.closeAll();
      expect(res.end).toHaveBeenCalled();
    });

    test('enforces MAX_CONNECTIONS_PER_USER', () => {
      const hub = new SseHub({ maxConnectionsPerUser: 3 });
      const userId = 'worker-quota-test';

      const createMockReqRes = () => {
        let statusCode = 200;
        let responseJson = null;
        return {
          req: { headers: {}, on: jest.fn() },
          res: {
            writeHead: jest.fn(),
            write: jest.fn(),
            flushHeaders: jest.fn(),
            status(code) {
              statusCode = code;
              return this;
            },
            json(data) {
              responseJson = data;
              return this;
            },
            on: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn(),
            getStatusCode: () => statusCode,
            getJson: () => responseJson,
          },
        };
      };

      // Connect 3 times (allowed)
      for (let i = 0; i < 3; i++) {
        const { req, res } = createMockReqRes();
        const client = hub.subscribe(`channel:${i}`, userId, req, res);
        expect(client).toBeDefined();
      }

      // 4th connection must be rejected with 429
      const fourth = createMockReqRes();
      const rejectedClient = hub.subscribe('channel:4', userId, fourth.req, fourth.res);
      expect(rejectedClient).toBeNull();
      expect(fourth.res.getStatusCode()).toBe(429);
      expect(fourth.res.getJson().error.code).toBe('MAX_SSE_CONNECTIONS_EXCEEDED');

      hub.closeAll();
    });
  });

  describe('3. Notification Worker Content Generation', () => {
    const { buildNotificationContent, sendMockSms, sendMockFcm } = require('../../src/services/notifications/notificationWorker');

    test('formats pre_alert notification correctly', () => {
      const content = buildNotificationContent('pre_alert', {
        zoneId: 'indiranagar',
        message: 'Heavy rain forecasted. Coverage active.',
      });
      expect(content.title).toContain('Pre-Alert');
      expect(content.body).toContain('Heavy rain forecasted');
    });

    test('formats claim_approved notification correctly', () => {
      const content = buildNotificationContent('claim_approved', {
        claimId: 'claim-123',
        amount: 500,
      });
      expect(content.title).toContain('Approved');
      expect(content.body).toContain('claim-123');
      expect(content.body).toContain('500');
    });

    test('formats claim_held notification correctly', () => {
      const content = buildNotificationContent('claim_held', {
        claimId: 'claim-456',
      });
      expect(content.title).toContain('Verification');
      expect(content.body).toContain('claim-456');
    });

    test('formats payout_sent notification correctly', () => {
      const content = buildNotificationContent('payout_sent', {
        claimId: 'claim-789',
        amount: 450,
      });
      expect(content.title).toContain('Payout');
      expect(content.body).toContain('450');
    });

    test('formats dispute_update notification correctly', () => {
      const content = buildNotificationContent('dispute_update', {
        claimId: 'claim-999',
        status: 'upheld',
      });
      expect(content.title).toContain('Dispute');
      expect(content.body).toContain('claim-999');
    });

    test('sendMockSms returns delivered status', async () => {
      const res = await sendMockSms({ phoneNumber: '+919876543210', message: 'Test message' });
      expect(res.success).toBe(true);
      expect(res.provider).toBe('mock-sms-gateway');
      expect(res.status).toBe('delivered');
    });

    test('sendMockFcm returns delivered status', async () => {
      const res = await sendMockFcm({ workerId: 'worker-1', title: 'Test', body: 'Test push' });
      expect(res.success).toBe(true);
      expect(res.provider).toBe('mock-firebase-cloud-messaging');
      expect(res.status).toBe('delivered');
    });
  });
});
