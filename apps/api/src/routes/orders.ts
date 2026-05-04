import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from './auth.js';
import { atomicDecrStock, atomicIncrStock, getStock, createQueue, initStock, Queues, redis } from '../services/redis.js';
import { v4 as uuidv4 } from 'uuid';
import { createSnapToken, getTransactionStatus } from '../lib/midtrans.js';
import { env } from '../config/env.js';
import { generateTicketCode } from '../lib/ticket-code.js';

const prisma = new PrismaClient();
const MIDTRANS_SNAP_REDIRECT_BASE = env.MIDTRANS_IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/v2/vtweb'
  : 'https://app.sandbox.midtrans.com/snap/v2/vtweb';

function getPaymentUrlFromToken(token?: string | null) {
  if (!token) return undefined;
  return `${MIDTRANS_SNAP_REDIRECT_BASE}/${token}`;
}

function verifyMidtransSignature(notificationBody: any): boolean {
  const serverKey = env.MIDTRANS_SERVER_KEY?.trim();
  if (!serverKey) return false;

  const orderId = String(notificationBody?.order_id || '');
  const statusCode = String(notificationBody?.status_code || '');
  // Midtrans gross_amount can be "10000.00", we need exact string for signature
  const grossAmount = String(notificationBody?.gross_amount || '');
  const signatureKey = String(notificationBody?.signature_key || '');

  if (!orderId || !statusCode || !grossAmount || !signatureKey) return false;

  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signatureKey, 'utf8')
  );
}

async function handlePaymentNotification(notificationBody: any, orderIdFromUrl?: string) {
  const orderId = notificationBody.order_id || orderIdFromUrl;
  if (!orderId) {
    throw new Error('Order ID missing in notification');
  }

  const actualOrderId = orderId.replace('midtrans_', '');
  const order = await prisma.order.findUnique({
    where: { id: actualOrderId },
    include: { items: { include: { category: true } }, event: true, user: true },
  });

  if (!order) {
    throw new Error(`Order ${actualOrderId} not found`);
  }

  const transactionStatus = notificationBody.transaction_status;
  const fraudStatus = notificationBody.fraud_status;
  const grossAmountRaw = Number(notificationBody?.gross_amount ?? NaN);
  const expectedFinal = order.finalAmount || 0;
  
  // Use a small epsilon for float comparison if needed, but Midtrans usually sends integer-like values
  const amountMatches = Math.abs(grossAmountRaw - expectedFinal) < 1;
  
  let newOrderStatus: string = order.status;
  let shouldEnqueueTicketGeneration = false;

  // Map Midtrans status to our status
  if (transactionStatus === 'capture') {
    if (fraudStatus === 'challenge') {
      newOrderStatus = 'PENDING';
    } else if (fraudStatus === 'accept') {
      newOrderStatus = 'PAID';
    }
  } else if (transactionStatus === 'settlement') {
    newOrderStatus = 'PAID';
  } else if (transactionStatus === 'cancel' || transactionStatus === 'deny') {
    newOrderStatus = 'CANCELLED';
  } else if (transactionStatus === 'expire') {
    newOrderStatus = 'EXPIRED';
  } else if (transactionStatus === 'pending') {
    newOrderStatus = 'PENDING';
  }

  // Update order if status changed
  if (newOrderStatus !== order.status) {
    let transitioned = false;
    
    if (newOrderStatus === 'CANCELLED' || newOrderStatus === 'EXPIRED') {
      // Only transition from PENDING to CANCELLED/EXPIRED
      await prisma.$transaction(async (tx) => {
        const transition = await tx.order.updateMany({
          where: { id: actualOrderId, status: 'PENDING' },
          data: { status: newOrderStatus as any },
        });
        transitioned = transition.count === 1;
        if (!transitioned) return;

        for (const item of order.items) {
          await tx.ticketCategory.updateMany({
            where: { id: item.categoryId },
            data: { sold: { decrement: item.quantity } },
          });
          await atomicIncrStock(order.eventId, item.categoryId, item.quantity);
        }

        await tx.ticket.updateMany({
          where: { orderId: actualOrderId },
          data: { status: 'CANCELLED' }
        });
      });
      
      if (transitioned) {
        console.log(`[PaymentCallback] Order ${actualOrderId} ${newOrderStatus} and stock restored`);
      }
    } else if (newOrderStatus === 'PAID') {
      if (!amountMatches) {
        console.error(`[PaymentCallback] Amount mismatch for order ${actualOrderId}. gross_amount=${grossAmountRaw}, expectedFinal=${expectedFinal}`);
        return { actualOrderId, newOrderStatus: order.status };
      }

      // Check if already expired
      if (order.expiredAt && new Date(order.expiredAt) <= new Date()) {
         console.warn(`[PaymentCallback] Order ${actualOrderId} paid AFTER expiration. Marking as PAID anyway but logging warning.`);
         // Optionally you could refund, but usually we accept it and fulfill.
      }

      const paidAt = new Date();
      await prisma.$transaction(async (tx) => {
        const transition = await tx.order.updateMany({
          where: { id: actualOrderId, status: 'PENDING' },
          data: { status: 'PAID', paidAt },
        });
        transitioned = transition.count === 1;
        if (!transitioned) return;

        // Generate tickets if not already created
        const existingTicketsCount = await tx.ticket.count({ where: { orderId: actualOrderId } });
        if (existingTicketsCount === 0) {
          const attendees = (order.attendees as any) || [];
          let attendeeIndex = 0;
          
          for (const item of order.items) {
            for (let i = 0; i < item.quantity; i++) {
              const holderName = attendees[attendeeIndex] || (order as any).buyerName || order.user?.name || 'Customer';
              attendeeIndex++;
              
              await tx.ticket.create({
                data: {
                  orderId: actualOrderId,
                  categoryId: item.categoryId,
                  userId: order.userId,
                  eventId: order.eventId,
                  ticketCode: generateTicketCode(order.event.slug),
                  holderName,
                  status: 'PENDING',
                }
              });
            }
          }
          console.log(`[PaymentCallback] Created ${attendeeIndex} tickets for order ${actualOrderId}`);
        } else {
          // If tickets already exist (legacy), just ensure they are PENDING
          await tx.ticket.updateMany({
            where: { orderId: actualOrderId, status: 'CANCELLED' },
            data: { status: 'PENDING' }
          });
        }
      });
      
      if (transitioned) {
        shouldEnqueueTicketGeneration = true;
        console.log(`[PaymentCallback] Order ${actualOrderId} marked as PAID`);
      }
    } else {
      // For other status changes (e.g. back to PENDING)
      const updateRes = await prisma.order.updateMany({
        where: { id: actualOrderId, status: { notIn: ['PAID', 'FULFILLED', 'REFUNDED', 'CANCELLED', 'EXPIRED'] as any } },
        data: { status: newOrderStatus as any },
      });
      transitioned = updateRes.count > 0;
    }

    if (shouldEnqueueTicketGeneration) {
      try {
        const queue = createQueue(Queues.TICKET_GENERATE);
        await queue.add('generate', { orderId: actualOrderId }, { jobId: `ticket-generate-${actualOrderId}` });
        console.log(`[PaymentCallback] Enqueued ticket generation for order ${actualOrderId}`);
      } catch (err) {
        console.error(`[PaymentCallback] Failed to enqueue ticket generation for order ${actualOrderId}:`, err);
      }
    }
  }

  return { actualOrderId, newOrderStatus };
}

const orderItemSchema = z.object({
  categoryId: z.string(),
  qty: z.number().int().positive(),
});

const buyerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
});

const orderSchema = z.object({
  eventSlug: z.string(),
  items: z.array(orderItemSchema),
  buyer: buyerSchema,
  attendees: z.array(z.string()).optional(),
  paymentMethod: z.string(),
  idempotencyKey: z.string().optional(),
  referralCode: z.string().optional(),
});

export async function orderRoutes(fastify: FastifyInstance) {
  fastify.post('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    let order;
    const decrementedReservations: Array<{ eventId: string; categoryId: string; qty: number }> = [];
    let stockCommitted = false;
    try {
      let data;
      try {
        data = orderSchema.parse(req.body);
      } catch (validationError: any) {
        console.error('[OrderCreate] Validation error:', validationError.errors);
        return reply.code(400).send({
          error: 'Validation failed',
          details: validationError.errors,
          code: 'VALIDATION_ERROR'
        });
      }
      const user = req.user as any;

      // 1. Enforce/Generate Idempotency Key
      let idempotencyKey = data.idempotencyKey;
      if (!idempotencyKey) {
        const payloadHash = crypto.createHash('md5')
          .update(JSON.stringify({
            userId: user.id,
            eventSlug: data.eventSlug,
            items: data.items,
            buyerEmail: data.buyer.email
          }))
          .digest('hex');
        idempotencyKey = `auto-${payloadHash}`;
      }

      // 2. Redis Lock to prevent concurrent requests for same user/event
      try {
        const lockKey = `order-lock:${user.id}:${data.eventSlug}`;
        const locked = await redis.set(lockKey, '1', 'PX', 5000, 'NX');
        if (!locked) {
          return reply.code(429).send({ error: 'Order is being processed, please wait...', code: 'TOO_MANY_REQUESTS' });
        }

        try {
          // Find event by slug
          const event = await prisma.event.findFirst({
            where: { OR: [{ slug: data.eventSlug }, { id: data.eventSlug }] },
          });
          if (!event) return reply.code(404).send({ error: 'Event not found' });

          const existingOrder = await prisma.order.findUnique({
            where: { idempotencyKey },
            include: { items: { include: { category: true } } },
          });

          if (existingOrder) {
            if (existingOrder.status !== 'PENDING' && existingOrder.status !== 'CANCELLED' && existingOrder.status !== 'EXPIRED') {
              return {
                orderId: existingOrder.id,
                status: existingOrder.status,
                paymentToken: existingOrder.midtransToken || undefined,
                paymentUrl: getPaymentUrlFromToken(existingOrder.midtransToken),
                expiresAt: existingOrder.expiredAt,
              };
            }
            if (existingOrder.status === 'PENDING') {
              order = existingOrder;
            }
          }

          if (!order) {
            // Calculate total and validate categories
            let totalAmount = 0;
            const itemsWithCategory: Array<{ item: any, category: any }> = [];
            for (const item of data.items) {
              const category = await prisma.ticketCategory.findFirst({ where: { id: item.categoryId, eventId: event.id } });
              if (!category) return reply.code(400).send({ error: `Category ${item.categoryId} not found` });
              itemsWithCategory.push({ item, category });
              totalAmount += category.price * item.qty;
            }

            // Validasi Kategori
            for (const { item, category } of itemsWithCategory) {
              if (category.isInternal) return reply.code(403).send({ error: `Tiket ${category.name} internal` });
              const now = new Date();
              if (category.saleStartAt && now < new Date(category.saleStartAt)) return reply.code(403).send({ error: 'Sale not started' });
              if (category.saleEndAt && now > new Date(category.saleEndAt)) return reply.code(403).send({ error: 'Sale ended' });
              if (category.sold >= category.quota) return reply.code(409).send({ error: 'Sold out' });
              if (item.qty > category.maxPerOrder) return reply.code(400).send({ error: 'Exceeds max per order' });
            }

            // Reserve stock
            for (const { item, category } of itemsWithCategory) {
              const stock = await getStock(event.id, item.categoryId);
              if (stock === null || stock < item.qty) {
                for (const dec of decrementedReservations) await atomicIncrStock(dec.eventId, dec.categoryId, dec.qty);
                return reply.code(409).send({ error: `Insufficient stock for ${category.name}` });
              }
              const result = await atomicDecrStock(event.id, item.categoryId, item.qty);
              if (result === null) {
                for (const dec of decrementedReservations) await atomicIncrStock(dec.eventId, dec.categoryId, dec.qty);
                return reply.code(409).send({ error: 'Sold out' });
              }
              decrementedReservations.push({ eventId: event.id, categoryId: item.categoryId, qty: item.qty });
            }

            let discountAmount = 0;
            if (data.referralCode) {
              const referrer = await prisma.affiliatePartner.findFirst({ where: { code: data.referralCode } });
              if (referrer) discountAmount = 10000;
            }

            const finalAmount = totalAmount + Math.round(totalAmount * 0.02) - discountAmount;

            order = await prisma.$transaction(async (tx) => {
              for (const { item, category } of itemsWithCategory) {
                const guard = await tx.ticketCategory.updateMany({
                  where: { id: category.id, eventId: event.id, sold: { lte: category.quota - item.qty } },
                  data: { sold: { increment: item.qty } },
                });
                if (!guard || guard.count !== 1) throw new Error(`QUOTA_EXCEEDED:${category.name}`);
              }
              
              const newOrder = await tx.order.create({
                data: {
                  userId: user.id, eventId: event.id, totalAmount, discountAmount, finalAmount,
                  idempotencyKey, status: 'PENDING', expiredAt: new Date(Date.now() + 15 * 60 * 1000),
                  paymentMethod: data.paymentMethod, attendees: data.attendees || [],
                  buyerName: data.buyer.name,
                  buyerEmail: data.buyer.email,
                  buyerPhone: data.buyer.phone,
                },
              });

              for (const { item, category } of itemsWithCategory) {
                await tx.orderItem.create({
                  data: {
                    orderId: newOrder.id,
                    categoryId: item.categoryId,
                    quantity: item.qty,
                    unitPrice: category.price,
                    subtotal: category.price * item.qty,
                  },
                });
              }

              return newOrder;
            });
            stockCommitted = true;
          }

          if (!order.items) {
            const fullOrder = await prisma.order.findUnique({
              where: { id: order.id },
              include: { items: { include: { category: true } } }
            });
            if (fullOrder) order = fullOrder as any;
          }

          // Schedule expiration
          if (order.status === 'PENDING') {
            const queue = createQueue(Queues.ORDER_EXPIRE);
            await queue.add('expire', { orderId: order.id }, { delay: 15 * 60 * 1000, jobId: `order-expire-${order.id}` });
            // Add reminder at 10 minutes (5 mins before expire)
            await queue.add('reminder', { orderId: order.id, type: 'reminder' }, { delay: 10 * 60 * 1000, jobId: `order-reminder-${order.id}` });
          }

          // Midtrans token
          let paymentToken = order.midtransToken;
          let paymentUrl = getPaymentUrlFromToken(paymentToken);

          if (!paymentToken && order.status === 'PENDING') {
            const midtransItems = order.items.map((it: any) => ({
              id: it.categoryId, name: it.category.name, price: it.category.price, quantity: it.quantity
            }));
            const serviceFee = Math.round(order.totalAmount * 0.02);
            if (serviceFee > 0) midtransItems.push({ id: 'SERVICE_FEE', name: 'Service Fee', price: serviceFee, quantity: 1 });

            const snapResult = await createSnapToken(
              order.id, order.finalAmount,
              { firstName: data.buyer.name, email: data.buyer.email, phone: data.buyer.phone },
              midtransItems, order.discountAmount || 0
            );
            paymentToken = snapResult.token;
            paymentUrl = snapResult.redirectUrl;
            await prisma.order.update({ where: { id: order.id }, data: { midtransToken: paymentToken, midtransOrderId: 'midtrans_' + order.id } });
          }

          console.log('[OrderCreate] Success, returning order:', order.id);
          return { orderId: order.id, status: order.status, paymentToken, paymentUrl, expiresAt: order.expiredAt };
        } finally {
          console.log('[OrderCreate] Releasing lock for:', user.id);
          await redis.del(lockKey).catch(e => console.error('[OrderCreate] Lock release error:', e));
        }
      } catch (error: any) {
        console.error('[OrderCreate] Inner Error:', error);
        if (!stockCommitted && decrementedReservations.length > 0) {
          console.log('[OrderCreate] Reverting stock for:', decrementedReservations.length, 'items');
          for (const dec of decrementedReservations) await atomicIncrStock(dec.eventId, dec.categoryId, dec.qty).catch(() => {});
        }
        if (error.message?.startsWith('QUOTA_EXCEEDED:')) return reply.code(409).send({ error: `Sold out: ${error.message.split(':')[1]}` });
        return reply.code(500).send({ error: 'Internal Server Error', message: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
      }
    } catch (outerError: any) {
      console.error('[OrderCreate] Outer Error:', outerError);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    
    let order = await prisma.order.findFirst({
      where: { id, userId: user.id },
      include: { items: { include: { category: true } }, event: true, tickets: true },
    });
    
    if (!order) return reply.code(404).send({ error: 'Order not found' });

    // Sync status with Midtrans if still PENDING
    if (order.status === 'PENDING') {
      try {
        console.log(`[OrderSync] Syncing status for order ${id}...`);
        const midtransStatus = await getTransactionStatus(id);
        if (midtransStatus) {
          const { newOrderStatus } = await handlePaymentNotification(midtransStatus, id);
          if (newOrderStatus !== 'PENDING') {
            // Re-fetch order if status changed
            order = await prisma.order.findFirst({
              where: { id, userId: user.id },
              include: { items: { include: { category: true } }, event: true, tickets: true },
            }) as any;
          }
        }
      } catch (err) {
        console.error(`[OrderSync] Failed to sync status for order ${id}:`, err);
        // Continue with DB status
      }
    }

    return order;
  });

  fastify.get('/mine', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const { status } = req.query as any;
    const now = new Date();

    const where: any = { userId: user.id };
    if (status) {
      where.status = status;
      if (status === 'PENDING') {
        where.expiredAt = { gt: now };
      }
    }

     const orders = await prisma.order.findMany({
       where,
       include: { 
         event: { select: { id: true, title: true, slug: true, startDate: true } }, 
         tickets: true,
         user: { select: { name: true, email: true } }
       },
       orderBy: { createdAt: 'desc' },
     });

    // Sync PENDING orders with Midtrans
    const pendingOrders = orders.filter(o => o.status === 'PENDING');
    if (pendingOrders.length > 0) {
      console.log(`[OrderSync] Syncing ${pendingOrders.length} pending orders for user ${user.id}`);
      await Promise.all(pendingOrders.map(async (order) => {
        try {
          const midtransStatus = await getTransactionStatus(order.id);
          if (midtransStatus) {
            await handlePaymentNotification(midtransStatus, order.id);
          }
        } catch (err) {
          console.error(`[OrderSync] Failed to sync order ${order.id}:`, err);
        }
      }));
      
      // Re-fetch if any were synced
      return prisma.order.findMany({
        where,
        include: { 
          event: { select: { id: true, title: true, slug: true, startDate: true } }, 
          tickets: true,
          user: { select: { name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return orders;
  });

   fastify.get('/my-orders', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
     const user = req.user as any;
      const orders = await prisma.order.findMany({
        where: { userId: user.id },
        include: { 
          event: { select: { id: true, title: true, slug: true, startDate: true } }, 
          tickets: true,
          user: { select: { name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' },
      });

     // Sync PENDING orders
     const pendingOrders = orders.filter(o => o.status === 'PENDING');
     if (pendingOrders.length > 0) {
       await Promise.all(pendingOrders.map(async (order) => {
         try {
           const midtransStatus = await getTransactionStatus(order.id);
           if (midtransStatus) await handlePaymentNotification(midtransStatus, order.id);
         } catch (err) {}
       }));
       return prisma.order.findMany({
         where: { userId: user.id },
         include: { event: { select: { id: true, title: true, slug: true, startDate: true } }, tickets: true },
         orderBy: { createdAt: 'desc' },
       });
     }

    console.log('[OrdersMine] Returning orders:', orders.map(o => ({
      id: o.id,
      status: o.status,
      expiredAt: o.expiredAt,
      createdAt: o.createdAt,
      now: new Date().toISOString(),
      isExpired: new Date(o.expiredAt) < new Date()
    })));
    return orders;
   });

  // Midtrans payment notification webhooks (no auth - called by Midtrans)
  
  // 1. Generic callback (Standard)
  fastify.post('/payment-callback', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const notificationBody = req.body as any;
      if (!verifyMidtransSignature(notificationBody)) {
        console.warn('[PaymentCallback] Invalid Midtrans signature on generic callback');
        return reply.code(401).send({ status: 'error', message: 'Invalid signature' });
      }
      console.log('[PaymentCallback] Received generic notification');
      const { actualOrderId, newOrderStatus } = await handlePaymentNotification(notificationBody);
      return { status: 'ok', orderId: actualOrderId, newStatus: newOrderStatus };
    } catch (error: any) {
      console.error('[PaymentCallback] Error processing callback:', error.message);
      // Return 200 for Midtrans to stop retrying even on errors (except for critical ones)
      return reply.code(200).send({ status: 'error', message: error.message });
    }
  });

  // 2. Legacy/Specific callback (with ID in URL)
  fastify.post('/:id/payment-callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: orderIdFromUrl } = req.params as any;
    try {
      const notificationBody = req.body as any;
      if (!verifyMidtransSignature(notificationBody)) {
        console.warn(`[PaymentCallback] Invalid Midtrans signature for ${orderIdFromUrl}`);
        return reply.code(401).send({ status: 'error', message: 'Invalid signature' });
      }
      console.log(`[PaymentCallback] Received notification for ${orderIdFromUrl}`);
      const { actualOrderId, newOrderStatus } = await handlePaymentNotification(notificationBody, orderIdFromUrl);
      return { status: 'ok', orderId: actualOrderId, newStatus: newOrderStatus };
    } catch (error: any) {
      console.error('[PaymentCallback] Error processing callback:', error.message);
      return reply.code(200).send({ status: 'error', message: error.message });
    }
  });
}
