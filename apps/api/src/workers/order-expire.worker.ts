import { Worker } from 'bullmq';
import { redis, atomicIncrStock } from '../services/redis.js';
import { PrismaClient } from '@prisma/client';
import { Queues } from '../services/redis.js';

const prisma = new PrismaClient();

async function processor(job: { data: { orderId: string } }) {
  const { orderId } = job.data;
  
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { categoryId: true, quantity: true } },
      event: { select: { title: true, slug: true } }
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
  
  // Handle Reminder Type
  if ((job as any).name === 'reminder' || (job.data as any).type === 'reminder') {
    if (order.status === 'PENDING') {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          type: 'ORDER_REMINDER',
          title: 'Segera Selesaikan Pembayaran',
          body: `Waktu Anda tinggal 5 menit lagi untuk menyelesaikan pembayaran event ${order.event?.title || ''}.`,
          data: { orderId: order.id, eventSlug: order.event?.slug }
        }
      }).catch(() => {});
    }
    return;
  }

  if (order.expiredAt && order.expiredAt > now) {
    console.log(`Order ${orderId} not yet expired (expires at ${order.expiredAt}). Skipping.`);
    return;
  }

  console.log(`Expiring order ${orderId}...`);
  let transitioned = false;
  await prisma.$transaction(async (tx) => {
    const currentOrder = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    const transition = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data: { status: 'EXPIRED' }
    });
    transitioned = transition.count === 1;
    if (!transitioned) return;

    for (const item of order.items) {
      await tx.ticketCategory.updateMany({
        where: { id: item.categoryId, sold: { gte: item.quantity } },
        data: { sold: { decrement: item.quantity } },
      });
      console.log(`Sold count decremented: categoryId=${item.categoryId}, quantity=${item.quantity}`);
    }

    await tx.ticket.updateMany({
      where: { orderId },
      data: { status: 'CANCELLED' }
    });

    await tx.orderStatusAuditLog.create({
      data: {
        orderId,
        fromStatus: (currentOrder?.status || 'PENDING') as any,
        toStatus: 'EXPIRED',
        source: 'order_expire_worker',
        reason: 'ttl_elapsed',
      },
    });
  });

  if (!transitioned) {
    console.log(`Order ${orderId} already transitioned by another process. Skipping stock restoration.`);
    return;
  }

  for (const item of order.items) {
    await atomicIncrStock(order.eventId, item.categoryId, item.quantity);
    console.log(`Stock restored: eventId=${order.eventId}, categoryId=${item.categoryId}, quantity=${item.quantity}`);
  }

  const itemsInfo = order.items.map(i => `${i.categoryId}:${i.quantity}`).join(',');
  console.log(`Order expired: ${orderId}, items: [${itemsInfo}]`);

  if (userId) {
    console.log(`Order ${orderId} expired - user ${userId} can be notified`);
    await prisma.notification.create({
      data: {
        userId,
        type: 'ORDER_EXPIRED',
        title: 'Pesanan Kedaluwarsa',
        body: `Pesanan Anda untuk event ${order.event?.title || ''} telah dibatalkan karena melewati batas waktu pembayaran 15 menit.`,
        data: { orderId: order.id, eventSlug: order.event?.slug }
      }
    }).catch(err => console.error('[NotificationError] Failed to create expiry notification:', err));
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
