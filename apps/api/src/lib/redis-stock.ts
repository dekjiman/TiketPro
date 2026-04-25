import { redis } from '../services/redis.js';

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

const QUOTA_KEY = 'tiket_quota';
const QUOTA_MAX_KEY = 'tiket_quota_max';

function getQuotaKey(categoryId: string): string {
  return `${QUOTA_KEY}:${categoryId}`;
}

function getQuotaMaxKey(categoryId: string): string {
  return `${QUOTA_MAX_KEY}:${categoryId}`;
}

async function handleRedisError(operation: string, categoryId: string, error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Redis error in ${operation} for category ${categoryId}:`, message);
  throw new AppError('SERVICE_UNAVAILABLE', `Redis service unavailable: ${operation}`, 503);
}

export async function initStock(categoryId: string, quota: number): Promise<void> {
  try {
    const key = getQuotaKey(categoryId);
    const setResult = await redis.set(key, quota, 'NX');
    if (setResult) {
      await redis.set(getQuotaMaxKey(categoryId), quota);
      console.log(`Stock initialized: categoryId=${categoryId}, quota=${quota}`);
    }
  } catch (error) {
    await handleRedisError('initStock', categoryId, error);
  }
}

export async function decrStock(
  categoryId: string,
  quantity: number
): Promise<{ success: boolean; remaining: number }> {
  const script = `
    local current = redis.call('DECRBY', KEYS[1], ARGV[1])
    if current < 0 then
      redis.call('INCRBY', KEYS[1], ARGV[1])
      return {0, redis.call('GET', KEYS[1])}
    end
    return {1, current}
  `;
  try {
    const key = getQuotaKey(categoryId);
    const result = await redis.eval(script, 1, key, quantity) as [number, string];
    const [success, remaining] = result;
    return {
      success: success === 1,
      remaining: parseInt(remaining),
    };
  } catch (error) {
    await handleRedisError('decrStock', categoryId, error);
  }
}

export async function incrStock(categoryId: string, quantity: number): Promise<number> {
  try {
    const key = getQuotaKey(categoryId);
    const maxKey = getQuotaMaxKey(categoryId);
    const maxQuota = await redis.get(maxKey);
    const max = maxQuota ? parseInt(maxQuota) : null;

    const currentValue = await redis.get(key);
    const current = currentValue ? parseInt(currentValue) : 0;
    let newValue = current + quantity;

    if (max !== null && newValue > max) {
      await redis.set(key, max);
      console.warn(
        `Stock overflow prevented for category ${categoryId}: attempted ${newValue}, capped to ${max}`
      );
      return max;
    }

    await redis.set(key, newValue);
    return newValue;
  } catch (error) {
    await handleRedisError('incrStock', categoryId, error);
  }
}

export async function getStock(categoryId: string): Promise<number> {
  try {
    const key = getQuotaKey(categoryId);
    const value = await redis.get(key);
    return value ? parseInt(value) : -1;
  } catch (error) {
    await handleRedisError('getStock', categoryId, error);
  }
}

export async function syncStockFromDb(
  categoryId: string,
  available: number
): Promise<void> {
  try {
    const key = getQuotaKey(categoryId);
    await redis.set(key, available);
    console.log(`Stock synced from DB: categoryId=${categoryId}, available=${available}`);
  } catch (error) {
    await handleRedisError('syncStockFromDb', categoryId, error);
  }
}