'use strict';

const crypto = require('crypto');

const QR_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a signed QR payload for dark store check-in.
 *
 * @param {string} darkStoreId - UUID of the dark store
 * @param {string} qrSecret    - HMAC secret key
 * @returns {{ payload: string, nonce: string, issued_at: number }}
 */
function generateQrPayload(darkStoreId, qrSecret) {
  const nonce = crypto.randomUUID();
  const issuedAt = Date.now();

  const data = JSON.stringify({
    dark_store_id: darkStoreId,
    nonce,
    issued_at: issuedAt,
  });

  const signature = crypto
    .createHmac('sha256', qrSecret)
    .update(data)
    .digest('hex');

  const payload = Buffer.from(
    JSON.stringify({
      dark_store_id: darkStoreId,
      nonce,
      issued_at: issuedAt,
      signature,
    })
  ).toString('base64');

  return { payload, nonce, issued_at: issuedAt };
}

/**
 * Verify a signed QR payload.
 *
 * @param {string|object} payloadInput - Base64-encoded QR string or object containing payload
 * @param {string} qrSecret            - HMAC secret key
 * @returns {{ valid: boolean, storeId?: string, nonce?: string, data: object|null, error: string|null }}
 */
function verifyQrPayload(payloadInput, qrSecret) {
  try {
    const payload = typeof payloadInput === 'object' && payloadInput?.payload
      ? payloadInput.payload
      : payloadInput;

    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    const { dark_store_id, nonce, issued_at, signature } = decoded;

    if (!dark_store_id || !nonce || !issued_at || !signature) {
      return { valid: false, data: null, error: 'Missing required fields in QR payload' };
    }

    // Check expiry
    const age = Date.now() - issued_at;
    if (age > QR_EXPIRY_MS) {
      return { valid: false, data: null, error: 'QR payload has expired' };
    }

    if (age < 0) {
      return { valid: false, data: null, error: 'QR payload issued_at is in the future' };
    }

    // Recompute signature
    const data = JSON.stringify({
      dark_store_id,
      nonce,
      issued_at,
    });

    const expectedSignature = crypto
      .createHmac('sha256', qrSecret)
      .update(data)
      .digest('hex');

    const sigValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!sigValid) {
      return { valid: false, data: null, error: 'Invalid QR signature' };
    }

    return {
      valid: true,
      storeId: dark_store_id,
      darkStoreId: dark_store_id,
      nonce,
      issued_at,
      data: { dark_store_id, nonce, issued_at },
      error: null,
    };
  } catch (err) {
    return { valid: false, data: null, error: `QR payload parse error: ${err.message}` };
  }
}

module.exports = { generateQrPayload, verifyQrPayload };
