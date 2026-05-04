import { PrismaClient, OrderStatus } from '@prisma/client';
import { atomicIncrStock, createQueue, Queues } from './redis.js';

const prisma = new PrismaClient();

function mapMidtransStatus(transactionStatus: string, fraudStatus: string): OrderStatus {
  if (transactionStatus === 'capture') {
    if (fraudStatus === 'accept') return 'PAID';
    return 'PENDING';
  }
  if (transactionStatus === 'settlement') return 'PAID';
  if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') return 'CANCELLED';
  return 'PENDING';
}

async function writeStatusAuditLog(params: {
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  source: string;
  reason?: string;
  payload?: unknown;
}) {
  const { orderId, fromStatus, toStatus, source, reason, payload } = params;
  await prisma.orderStatusAuditLog.create({
    data: {
      orderId,
      fromStatus,
      toStatus,
      source,
      reason,
      payloadJson: payload ? JSON.stringify(payload) : undefined,
    },
  });
}

export async function processMidtransNotification(notificationBody: any, source = 'midtrans_webhook') {
  const orderId = String(notificationBody?.order_id || '');
  if (!orderId) throw new Error('Order ID missing in notification');

  const actualOrderId = orderId.replace('midtrans_', '');
  const order = await prisma.order.findUnique({
    where: { id: actualOrderId },
    include: { items: true },
  });
  if (!order) throw new Error(`Order ${actualOrderId} not found`);

  const transactionStatus = String(notificationBody?.transaction_status || '');
  const fraudStatus = String(notificationBody?.fraud_status || '');
  const grossAmountRaw = Number(notificationBody?.gross_amount ?? NaN);
  const serviceFee = Math.round((order.totalAmount || 0) * 0.02);
  const expectedGross = (order.totalAmount || 0) + serviceFee;
  const expectedFinal = order.finalAmount || 0;
  const amountMatches = Number.isFinite(grossAmountRaw) && (grossAmountRaw === expectedGross || grossAmountRaw === expectedFinal);

  const newOrderStatus = mapMidtransStatus(transactionStatus, fraudStatus);
  if (newOrderStatus === order.status) {
    return { actualOrderId, newOrderStatus, transitioned: false };
  }

  let transitioned = false;

  if (newOrderStatus === 'CANCELLED') {
    await prisma.$transaction(async (tx) => {
      const transition = await tx.order.updateMany({
        where: { id: actualOrderId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      transitioned = transition.count === 1;
      if (!transitioned) return;

      for (const item of order.items) {
        await tx.ticketCategory.updateMany({
          where: { id: item.categoryId, sold: { gte: item.quantity } },
          data: { sold: { decrement: item.quantity } },
        });
      }

      await tx.ticket.updateMany({
        where: { orderId: actualOrderId },
        data: { status: 'CANCELLED' }
      });
    });

    if (transitioned) {
      for (const item of order.items) {
        await atomicIncrStock(order.eventId, item.categoryId, item.quantity);
      }
      await writeStatusAuditLog({
        orderId: actualOrderId,
        fromStatus: order.status,
        toStatus: 'CANCELLED',
        source,
        reason: `midtrans_${transactionStatus}`,
        payload: notificationBody,
      });
    }

    return { actualOrderId, newOrderStatus: 'CANCELLED', transitioned };
  }

  if (newOrderStatus === 'PAID') {
    if (!amountMatches) {
      await writeStatusAuditLog({
        orderId: actualOrderId,
        fromStatus: order.status,
        toStatus: order.status,
        source,
        reason: 'amount_mismatch',
        payload: {
          grossAmountRaw,
          expectedGross,
          expectedFinal,
          transactionStatus,
          fraudStatus,
        },
      });
      return { actualOrderId, newOrderStatus: order.status, transitioned: false };
    }

    if (order.expiredAt && new Date(order.expiredAt) <= new Date()) {
      await prisma.$transaction(async (tx) => {
        const transition = await tx.order.updateMany({
          where: { id: actualOrderId, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        transitioned = transition.count === 1;
        if (!transitioned) return;

        for (const item of order.items) {
          await tx.ticketCategory.updateMany({
            where: { id: item.categoryId, sold: { gte: item.quantity } },
            data: { sold: { decrement: item.quantity } },
          });
        }

        await tx.ticket.updateMany({
          where: { orderId: actualOrderId },
          data: { status: 'CANCELLED' }
        });
      });

      if (transitioned) {
        for (const item of order.items) {
          await atomicIncrStock(order.eventId, item.categoryId, item.quantity);
        }
        await writeStatusAuditLog({
          orderId: actualOrderId,
          fromStatus: order.status,
          toStatus: 'EXPIRED',
          source,
          reason: 'payment_after_expiry',
          payload: notificationBody,
        });
      }
      return { actualOrderId, newOrderStatus: 'EXPIRED', transitioned };
    }

    await prisma.$transaction(async (tx) => {
      const transition = await tx.order.updateMany({
        where: { id: actualOrderId, status: 'PENDING' },
        data: { status: 'PAID', paidAt: new Date() },
      });
      transitioned = transition.count === 1;
      if (!transitioned) return;

      await writeStatusAuditLog({
        orderId: actualOrderId,
        fromStatus: order.status,
        toStatus: 'PAID',
        source,
        reason: `midtrans_${transactionStatus}`,
        payload: notificationBody,
      });
    });

    if (transitioned) {
      const queue = createQueue(Queues.TICKET_GENERATE);
      await queue.add('generate', { orderId: actualOrderId }, { jobId: `ticket-generate:${actualOrderId}` });
    }

    return { actualOrderId, newOrderStatus: 'PAID', transitioned };
  }

  return { actualOrderId, newOrderStatus, transitioned: false };
}

