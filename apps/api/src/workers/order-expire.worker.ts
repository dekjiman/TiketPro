import { Worker } from 'bullmq';
import { redis } from '../services/redis.js';
import { PrismaClient } from '@prisma/client';
import { incrStock } from '../lib/redis-stock.js';
import { Queues } from '../services/redis.js';

const prisma = new PrismaClient();

async function processor(job: { data: { orderId: string } }) {
  const { orderId } = job.data;
  
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { categoryId: true, quantity: true } }
    }
  });

  if (!order) {
    console.log(`Order ${orderId} not found`);
    return;
  }

  if (order.status !== 'PENDING') {
    console.log(`Order ${orderId} status is ${order.status}, not PENDING. Skipping expiration.`);
    return;
  }

  const now = new Date();
  if (order.expiredAt && order.expiredAt > now) {
    console.log(`Order ${orderId} not yet expired (expires at ${order.expiredAt}). Skipping.`);
    return;
  }

  console.log(`Expiring order ${orderId}...`);

  for (const item of order.items) {
    await incrStock(item.categoryId, item.quantity);
    console.log(`Stock restored: categoryId=${item.categoryId}, quantity=${item.quantity}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'EXPIRED' }
    });

    await tx.ticket.updateMany({
      where: { orderId },
      data: { status: 'CANCELLED' }
    });
  });

  const itemsInfo = order.items.map(i => `${i.categoryId}:${i.quantity}`).join(',');
  console.log(`Order expired: ${orderId}, items: [${itemsInfo}]`);

  const userId = order.userId;
  if (userId) {
    console.log(`Order ${orderId} expired - user ${userId} can be notified if needed`);
  }
}

export function createOrderExpireWorker() {
  const worker = new Worker(Queues.ORDER_EXPIRE, processor, {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 10,
      duration: 1000
    }
  });

  worker.on('failed', (job, err) => {
    console.error('order:expire failed:', { jobId: job?.id, error: err.message });
  });

  console.log('Order expire worker started');

  return worker;
}