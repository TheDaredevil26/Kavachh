'use strict';

const { encrypt, decrypt } = require('../../src/utils/encryption');

describe('PII Encryption (AES-256-GCM)', () => {
  test('encrypts and decrypts string successfully', () => {
    const raw = '1234-5678-9012';
    const cipher = encrypt(raw);

    expect(cipher).not.toBe(raw);
    expect(cipher.split(':')).toHaveLength(3); // iv:authTag:content

    const decrypted = decrypt(cipher);
    expect(decrypted).toBe(raw);
  });

  test('different ciphertexts for identical plaintext due to random IV', () => {
    const raw = 'SBIN0001234';
    const c1 = encrypt(raw);
    const c2 = encrypt(raw);

    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe(raw);
    expect(decrypt(c2)).toBe(raw);
  });

  test('fails decryption when ciphertext is tampered', () => {
    const raw = 'secret-pan-number';
    const cipher = encrypt(raw);
    const parts = cipher.split(':');
    
    // Tamper with content byte
    const tamperedContent = parts[2].substring(0, parts[2].length - 2) + 'aa';
    const tampered = `${parts[0]}:${parts[1]}:${tamperedContent}`;

    expect(() => decrypt(tampered)).toThrow();
  });
});
