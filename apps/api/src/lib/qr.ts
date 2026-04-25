import * as crypto from 'crypto';
import { promisify } from 'util';
import * as QRCode from 'qrcode';

const generateAsync = promisify(QRCode.toBuffer) as (
  data: string,
  options?: QRCode.QRCodeToBufferOptions
) => Promise<Buffer>;

export interface QrPayload {
  tid: string;
  eid: string;
  cid: string;
  uid: string;
  hn: string;
  iat: number;
  sig: string;
}

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    Error.captureStackTrace(this, this.constructor);
  }
}

function getHmacSecret(): Buffer {
  const secret = process.env.QR_HMAC_SECRET;
  if (!secret) {
    throw new AppError('MISSING_ENV', 'QR_HMAC_SECRET is required', 500);
  }
  return Buffer.from(secret, 'utf-8');
}

function getEncryptionKey(): Buffer {
  const key = process.env.QR_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new AppError('MISSING_ENV', 'QR_ENCRYPTION_KEY must be 64 hex characters', 500);
  }
  return Buffer.from(key, 'hex');
}

export function signPayload(payload: Omit<QrPayload, 'sig'>): string {
  const hmacSecret = getHmacSecret();
  const json = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', hmacSecret);
  hmac.update(json);
  const digest = hmac.digest('hex');
  return digest.substring(0, 16);
}

export function encryptQrPayload(payload: QrPayload): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const json = JSON.stringify(payload);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString('base64url');
}

export function decryptQrPayload(encoded: string): QrPayload {
  try {
    const key = getEncryptionKey();
    const buffer = Buffer.from(encoded, 'base64url');
    if (buffer.length < 28) {
      throw new AppError('INVALID_QR', 'QR code tidak valid atau sudah dimodifikasi', 410);
    }
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf-8')) as QrPayload;
    return payload;
  } catch {
    throw new AppError('INVALID_QR', 'QR code tidak valid atau sudah dimodifikasi', 410);
  }
}

export async function generateQrImage(encoded: string): Promise<Buffer> {
  return generateAsync(encoded, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}

export function verifyQrSignature(payload: QrPayload): boolean {
  const { sig, ...withoutSig } = payload;
  const computedSig = signPayload(withoutSig);
  if (sig.length !== computedSig.length) {
    return false;
  }
  const sigBuffer = Buffer.from(sig);
  const computedBuffer = Buffer.from(computedSig);
  return crypto.timingSafeEqual(sigBuffer, computedBuffer);
}