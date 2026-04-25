import { redis } from '../services/redis.js';
import * as jose from 'jose';
import { env } from '../config/env.js';

const WAITING_ROOM_ACTIVE_KEY = 'waiting_room_active';
const WAITING_ROOM_KEY = 'waiting_room';

function getActiveKey(categoryId: string): string {
  return `${WAITING_ROOM_ACTIVE_KEY}:${categoryId}`;
}

function getQueueKey(categoryId: string): string {
  return `${WAITING_ROOM_KEY}:${categoryId}`;
}

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);
const algorithm = 'HS256';

export async function isWaitingRoomActive(categoryId: string): Promise<boolean> {
  const key = getActiveKey(categoryId);
  const value = await redis.get(key);
  return value === '1';
}

export async function activateWaitingRoom(categoryId: string): Promise<void> {
  const key = getActiveKey(categoryId);
  await redis.set(key, '1', 'EX', 3600);
  console.log(`Waiting room activated for category: ${categoryId}`);
}

export async function deactivateWaitingRoom(categoryId: string): Promise<void> {
  const key = getActiveKey(categoryId);
  await redis.del(key);
  console.log(`Waiting room deactivated for category: ${categoryId}`);
}

export async function enqueueUser(categoryId: string, userId: string): Promise<number> {
  const key = getQueueKey(categoryId);
  const timestamp = Date.now();
  const added = await redis.zadd(key, timestamp, userId, 'NX');
  if (!added) {
    const position = await redis.zrank(key, userId);
    return position !== null ? position + 1 : -1;
  }
  const position = await redis.zrank(key, userId);
  return position !== null ? position + 1 : -1;
}

export async function getQueuePosition(
  categoryId: string,
  userId: string
): Promise<number | null> {
  const key = getQueueKey(categoryId);
  const position = await redis.zrank(key, userId);
  return position !== null ? position + 1 : null;
}

export async function processQueue(categoryId: string): Promise<string[]> {
  const key = getQueueKey(categoryId);
  const batchSize = env.WAITING_ROOM_BATCH_SIZE;
  const userIds = await redis.zrange(key, 0, batchSize - 1);
  if (userIds.length === 0) {
    return [];
  }

  const tokens: string[] = [];
  for (const userId of userIds) {
    const token = await generateCheckoutToken(userId, categoryId);
    tokens.push(token);
  }

  await redis.zrem(key, ...userIds);

  console.log(`Processed ${userIds.length} users from waiting room for category: ${categoryId}`);
  return tokens;
}

export async function generateCheckoutToken(
  userId: string,
  categoryId: string
): Promise<string> {
  const payload = {
    userId,
    categoryId,
    type: 'CHECKOUT',
  };
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(jwtSecret);
  return token;
}

export async function validateCheckoutToken(
  token: string
): Promise<{ userId: string; categoryId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, jwtSecret);
    if (payload.type !== 'CHECKOUT') {
      return null;
    }
    return {
      userId: payload.userId as string,
      categoryId: payload.categoryId as string,
    };
  } catch {
    return null;
  }
}

export function calculateEstimatedWait(position: number): number {
  const batchSize = env.WAITING_ROOM_BATCH_SIZE;
  const tickMs = env.WAITING_ROOM_TICK_MS;
  const ticksNeeded = Math.ceil(position / batchSize);
  return ticksNeeded * (tickMs / 1000);
}