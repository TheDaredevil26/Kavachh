'use strict';

const crypto = require('crypto');
const { redis } = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * Bank API Client (Mock Payment Rail for Instant Disbursals e.g., IMPS / UPI / NEFT).
 * Strictly idempotent: multiple invocations with the same idempotencyKey return
 * the exact same response without re-triggering payout rails.
 */
class BankClient {
  /**
   * Execute an instant disbursement to a worker's bank account.
   *
   * @param {object} params
   * @param {string} params.idempotencyKey - Unique idempotency identifier (e.g. payout:{claim_id})
   * @param {string} params.account        - Decrypted bank account number
   * @param {string} params.ifsc           - Decrypted IFSC code
   * @param {number|object} params.amount  - Transfer amount in INR
   * @param {string} [params.reference]    - Payout entity ID or remark
   * @returns {Promise<{ success: boolean, referenceNumber: string|null, error: string|null }>}
   */
  async transfer({ idempotencyKey, account, ifsc, amount, reference }) {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey is required for bank transfer');
    }

    const redisKey = `bank:idempotency:${idempotencyKey}`;

    // 1. Check idempotency cache in Redis (TTL: 7 days)
    try {
      const cachedResponse = await redis.get(redisKey);
      if (cachedResponse) {
        logger.info('Bank transfer served from idempotency cache', { idempotencyKey });
        return JSON.parse(cachedResponse);
      }
    } catch (err) {
      logger.warn('Failed to read bank idempotency cache', { error: err.message });
    }

    // 2. Validate transfer inputs
    const numAmount = typeof amount === 'number'
      ? amount
      : (amount && typeof amount.toNumber === 'function' ? amount.toNumber() : Number(amount));

    if (!numAmount || numAmount <= 0) {
      const errorResult = {
        success: false,
        referenceNumber: null,
        error: 'INVALID_PAYOUT_AMOUNT: Amount must be greater than zero',
      };
      return errorResult;
    }

    // 3. Simulated failure triggers for testing
    const strAccount = String(account || '');
    if (strAccount.endsWith('9999') || strAccount.includes('FAIL')) {
      const failResult = {
        success: false,
        referenceNumber: null,
        error: 'BENEFICIARY_BANK_OFFLINE: Destination account rejected transaction',
      };
      await this._cacheResult(redisKey, failResult);
      return failResult;
    }

    // 4. Generate unique simulated Bank UTR (Unique Transaction Reference)
    const utrSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const referenceNumber = `UTR_KV_${Date.now()}_${utrSuffix}`;

    const successResult = {
      success: true,
      referenceNumber,
      error: null,
      transferredAt: new Date().toISOString(),
      amount: numAmount,
      referenceId: reference || null,
    };

    logger.info('Mock bank transfer successful', {
      idempotencyKey,
      referenceNumber,
      amount: numAmount,
    });

    // 5. Store in Redis for idempotency guarantee
    await this._cacheResult(redisKey, successResult);

    return successResult;
  }

  async _cacheResult(key, data) {
    try {
      await redis.set(key, JSON.stringify(data), 'EX', 7 * 86400); // 7-day TTL
    } catch (err) {
      logger.warn('Failed to cache bank transfer outcome', { error: err.message, key });
    }
  }
}

const bankClient = new BankClient();

module.exports = bankClient;
module.exports.BankClient = BankClient;
