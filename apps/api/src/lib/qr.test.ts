import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  signPayload,
  encryptQrPayload,
  decryptQrPayload,
  generateQrImage,
  verifyQrSignature,
  QrPayload,
  AppError,
} from './qr.js';

const TEST_HMAC_SECRET = 'test-hmac-secret-key-min-32-chars!';
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

describe('QR Library', () => {
  beforeAll(() => {
    process.env.QR_HMAC_SECRET = TEST_HMAC_SECRET;
    process.env.QR_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  describe('signPayload', () => {
    it('should generate 16-char signature', () => {
      const payload = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
      };
      const sig = signPayload(payload);
      expect(sig).toHaveLength(16);
      expect(sig).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce same signature for same payload', () => {
      const payload = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
      };
      const sig1 = signPayload(payload);
      const sig2 = signPayload(payload);
      expect(sig1).toBe(sig2);
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt correctly', () => {
      const payload: QrPayload = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
        sig: signPayload({
          tid: 'ticket-123',
          eid: 'event-456',
          cid: 'cat-789',
          uid: 'user-001',
          hn: 'John Doe',
          iat: 1700000000,
        }),
      };

      const encrypted = encryptQrPayload(payload);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(JSON.stringify(payload));

      const decrypted = decryptQrPayload(encrypted);
      expect(decrypted.tid).toBe(payload.tid);
      expect(decrypted.eid).toBe(payload.eid);
      expect(decrypted.cid).toBe(payload.cid);
      expect(decrypted.uid).toBe(payload.uid);
      expect(decrypted.hn).toBe(payload.hn);
      expect(decrypted.iat).toBe(payload.iat);
      expect(decrypted.sig).toBe(payload.sig);
    });

    it('should produce different ciphertext for same payload (due to random IV)', () => {
      const payload: QrPayload = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
        sig: 'aabbccddeeff0011',
      };

      const encrypted1 = encryptQrPayload(payload);
      const encrypted2 = encryptQrPayload(payload);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decryptQrPayload', () => {
    it('should throw AppError for invalid base64 string', () => {
      expect(() => decryptQrPayload('not-valid-base64!')).toThrow(AppError);
    });

    it('should throw AppError for tampered ciphertext', () => {
      const payload: QrPayload = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
        sig: 'aabbccddeeff0011',
      };

      const encrypted = encryptQrPayload(payload);
      const tampered = encrypted.slice(0, -2) + 'xx';

      expect(() => decryptQrPayload(tampered)).toThrow(AppError);
    });

    it('should throw AppError with code INVALID_QR', () => {
      try {
        decryptQrPayload('invalid');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('INVALID_QR');
        expect((error as AppError).httpStatus).toBe(410);
      }
    });
  });

  describe('verifyQrSignature', () => {
    it('should return true for valid signature', () => {
      const payloadWithoutSig = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
      };
      const sig = signPayload(payloadWithoutSig);
      const payload: QrPayload = { ...payloadWithoutSig, sig };

      const isValid = verifyQrSignature(payload);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload: QrPayload = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
        sig: 'invalid-sig-123',
      };

      const isValid = verifyQrSignature(payload);
      expect(isValid).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const payloadWithoutSig = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
      };
      const sig = signPayload(payloadWithoutSig);
      const payload: QrPayload = { ...payloadWithoutSig, sig };

      const tamperedPayload: QrPayload = { ...payload, hn: 'Tampered Name' };

      const isValid = verifyQrSignature(tamperedPayload);
      expect(isValid).toBe(false);
    });
  });

  describe('generateQrImage', () => {
    it('should generate PNG buffer', async () => {
      const payload: QrPayload = {
        tid: 'ticket-123',
        eid: 'event-456',
        cid: 'cat-789',
        uid: 'user-001',
        hn: 'John Doe',
        iat: 1700000000,
        sig: signPayload({
          tid: 'ticket-123',
          eid: 'event-456',
          cid: 'cat-789',
          uid: 'user-001',
          hn: 'John Doe',
          iat: 1700000000,
        }),
      };

      const encrypted = encryptQrPayload(payload);
      const qrBuffer = await generateQrImage(encrypted);

      expect(qrBuffer).toBeInstanceOf(Buffer);
      expect(qrBuffer.length).toBeGreaterThan(0);

      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(qrBuffer.subarray(0, 4)).toEqual(pngSignature);
    });
  });
});