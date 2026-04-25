import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: 3,
});

export async function connectRedis() {
  try {
    await redis.ping();
    console.log('✅ Redis connected');
    return redis;
  } catch (err) {
    console.error('❌ Redis connection failed!');
    console.error('Please make sure Redis is running on', REDIS_HOST + ':' + REDIS_PORT);
    console.error('Error details:', (err as Error).message);
    throw err;
  }
}

export const Queues = {
  ORDER_EXPIRE: 'order:expire',
  TICKET_GENERATE: 'ticket:generate',
  EMAIL_SEND: 'email:send',
  SMS_SEND: 'sms:send',
  XP_CALC: 'xp:calculate',
  LEADERBOARD_UPDATE: 'leaderboard:update',
};

export function createQueue(name: string) {
  return new Queue(name, { connection: redis });
}

export function createWorker(name: string, processor: (job: any) => Promise<void>) {
  return new Worker(name, processor, { connection: redis });
}

export async function atomicDecrStock(eventId: string, categoryId: string, qty: number) {
  const key = `stock:${eventId}:${categoryId}`;
  const result = await redis.decrby(key, qty);
  if (result < 0) {
    await redis.incrby(key, qty);
    return null;
  }
  return result;
}

export async function atomicIncrStock(eventId: string, categoryId: string, qty: number) {
  const key = `stock:${eventId}:${categoryId}`;
  return redis.incrby(key, qty);
}

export async function getStock(eventId: string, categoryId: string) {
  const key = `stock:${eventId}:${categoryId}`;
  const stock = await redis.get(key);
  return stock ? parseInt(stock) : null;
}

export async function initStock(eventId: string, categoryId: string, quantity: number) {
  const key = `stock:${eventId}:${categoryId}`;
  await redis.set(key, quantity);
}

export async function addToWaitingRoom(userId: string, eventId: string, score: number) {
  const key = `waiting:${eventId}`;
  await redis.zadd(key, score, userId);
}

export async function getQueuePosition(eventId: string, userId: string) {
  const key = `waiting:${eventId}`;
  const position = await redis.zrank(key, userId);
  return position !== null ? position + 1 : null;
}

export async function getWaitingRoomCount(eventId: string) {
  const key = `waiting:${eventId}`;
  return redis.zcard(key);
}