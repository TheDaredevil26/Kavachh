'use strict';

const { generateQrPayload, verifyQrPayload } = require('../../src/utils/qr');

describe('Dark-Store QR Sign/Verify', () => {
  const secret = 'store-test-secret-12345';
  const storeId = 'store-uuid-001';

  test('generates valid payload and verifies successfully within window', () => {
    const payload = generateQrPayload(storeId, secret);
    expect(payload).toBeDefined();

    const verified = verifyQrPayload(payload, secret);
    expect(verified.valid).toBe(true);
    expect(verified.storeId).toBe(storeId);
    expect(verified.nonce).toBeDefined();
  });

  test('rejects verification if wrong secret used', () => {
    const payload = generateQrPayload(storeId, secret);
    const verified = verifyQrPayload(payload, 'wrong-secret');
    expect(verified.valid).toBe(false);
  });
});
