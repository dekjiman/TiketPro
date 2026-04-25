import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { redis } from '../../services/redis.js';
import { decrStock, incrStock } from '../../lib/redis-stock.js';
import { isWaitingRoomActive, validateCheckoutToken } from '../../lib/waiting-room.js';
import { generateTicketCode } from '../../lib/ticket-code.js';
import { env } from '../../config/env.js';
import * as jose from 'jose';

const prisma = new PrismaClient();
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

const IDEMPOTENCY_PREFIX = 'idempotency:';

const CreateOrderSchema = z.object({
  categoryId: z.string().cuid(),
  quantity: z.number().int().min(1).max(10),
  holders: z.array(z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })).min(1).max(10),
  referralCode: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});

type CreateOrderBody = z.infer<typeof CreateOrderSchema>;

const holderSchema = CreateOrderSchema.shape.holders.element;

async function createMidtransTransaction(order: any): Promise<{ token: string; redirectUrl: string }> {
  return {
    token: 'mock_token_' + Date.now(),
    redirectUrl: 'https://app.midtrans.com/mock'
  };
}

function logAudit(event: string, userId: string, data: any) {
  console.log(`[AUDIT] ${event}: userId=${userId}`, data);
}

export async function createOrderRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: CreateOrderBody }>('/create', {
    schema: {
      body: {
        type: 'object',
        required: ['categoryId', 'quantity', 'holders', 'idempotencyKey'],
        properties: {
          categoryId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 10 },
          holders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 100 },
                email: { type: 'string' },
                phone: { type: 'string' }
              }
            }
          },
          referralCode: { type: 'string' },
          idempotencyKey: { type: 'string' }
        }
      }
    }
  }, async (req: FastifyRequest<{ Body: CreateOrderBody }>, reply: FastifyReply) => {
    const data = CreateOrderSchema.parse(req.body);
    const user = (req as any).user as { id: string } | undefined;
    const userId = user?.id;
    const checkoutToken = req.headers['x-checkout-token'] as string | undefined;
    const ipAddress = req.ip;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const idempotencyKey = `${IDEMPOTENCY_PREFIX}${data.idempotencyKey}`;
    const existingIdemOrderId = await redis.get(idempotencyKey);
    
    if (existingIdemOrderId && existingIdemOrderId !== 'processing') {
      const existingOrder = await prisma.order.findUnique({
        where: { id: existingIdemOrderId },
        select: { id: true, status: true, midtransToken: true }
      });
      if (existingOrder) {
        return reply.code(409).send({
          orderId: existingOrder.id,
          status: existingOrder.status,
          paymentToken: existingOrder.midtransToken || ''
        });
      }
    }

    const waitingRoomActive = await isWaitingRoomActive(data.categoryId);
    if (waitingRoomActive) {
      if (!checkoutToken) {
        return reply.code(202).send({ waitingRoom: true, message: 'Join waiting room first' });
      }
      const tokenPayload = await validateCheckoutToken(checkoutToken);
      if (!tokenPayload || tokenPayload.userId !== userId) {
        return reply.code(401).send({ error: 'Invalid checkout token' });
      }
    }

    const category = await prisma.ticketCategory.findUnique({
      where: { id: data.categoryId },
      include: {
        event: {
          include: { venues: true }
        }
      }
    });

    if (!category) {
      return reply.code(400).send({ error: 'Category not found' });
    }

    if (category.event.status !== 'PUBLISHED' && category.event.status !== 'SALE_OPEN') {
      return reply.code(400).send({ error: 'Event not open for sale' });
    }

    if (category.status !== 'ACTIVE') {
      return reply.code(400).send({ error: 'Category not active' });
    }

    const now = new Date();
    if (category.saleStartAt && now < category.saleStartAt) {
      return reply.code(400).send({ error: 'Sale has not started yet' });
    }
    if (category.saleEndAt && now > category.saleEndAt) {
      return reply.code(400).send({ error: 'Sale has ended' });
    }

    if (data.quantity > category.maxPerOrder) {
      return reply.code(400).send({ error: `Maximum ${category.maxPerOrder} tickets per order` });
    }

    if (data.holders.length !== data.quantity) {
      return reply.code(400).send({ error: 'Holders count must match quantity' });
    }

    const userOrderCount = await prisma.order.count({
      where: {
        userId,
        status: 'PAID',
        items: { some: { categoryId: data.categoryId } }
      }
    });

    if (category.maxPerAccount && userOrderCount >= category.maxPerAccount) {
      return reply.code(400).send({ error: 'Maximum orders reached for this category' });
    }

    await redis.set(idempotencyKey, 'processing', 'EX', 3600);

    const stockResult = await decrStock(data.categoryId, data.quantity);
    if (!stockResult.success) {
      await redis.del(idempotencyKey);
      return reply.code(409).send({ error: 'TICKET_SOLD_OUT', message: 'Tickets sold out' });
    }

    let discountAmount = 0;
    if (data.referralCode) {
      const referrer = await prisma.affiliatePartner.findUnique({
        where: { code: data.referralCode }
      });
      if (referrer) {
        discountAmount = 5000;
      }
    }

    const basePrice = category.price * data.quantity;
    const finalAmount = Math.max(0, basePrice - discountAmount);
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000);

    try {
      const ticketsData = data.holders.map(() => ({
        ticketCode: generateTicketCode(category.event.slug),
        status: 'PENDING' as const,
        holderName: '',
        isInternal: false
      }));

      for (let i = 0; i < data.holders.length; i++) {
        ticketsData[i].holderName = data.holders[i].name;
        ticketsData[i].ticketCode = generateTicketCode(category.event.slug);
      }

      const order = await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            userId,
            eventId: category.eventId,
            idempotencyKey: data.idempotencyKey,
            status: 'PENDING',
            totalAmount: basePrice,
            discountAmount,
            finalAmount,
            expiredAt,
            items: {
              create: [{
                categoryId: data.categoryId,
                quantity: data.quantity,
                unitPrice: category.price,
                subtotal: basePrice
              }]
            },
            tickets: {
              create: ticketsData.map(t => ({
                userId,
                categoryId: data.categoryId,
                ticketCode: t.ticketCode,
                holderName: t.holderName,
                status: 'PENDING',
                isInternal: false
              }))
            }
          },
          include: {
            items: true,
            tickets: { select: { id: true, ticketCode: true, holderName: true } }
          }
        });

        return newOrder;
      });

      const midtransResult = await createMidtransTransaction(order);
      
      await prisma.order.update({
        where: { id: order.id },
        data: {
          midtransToken: midtransResult.token,
          midtransOrderId: 'midtrans_' + order.id
        }
      });

      await redis.set(idempotencyKey, order.id, 'EX', 3600);

      const orderExpireQueue = new (await import('bullmq')).Queue('order:expire', { connection: redis });
      await orderExpireQueue.add('expire', { orderId: order.id }, { delay: 15 * 60 * 1000 });

      logAudit('ORDER_CREATED', userId, { orderId: order.id, amount: finalAmount, ipAddress });

      return reply.code(201).send({
        orderId: order.id,
        status: 'PENDING',
        totalAmount: basePrice,
        discountAmount,
        finalAmount,
        expiredAt: order.expiredAt.toISOString(),
        paymentToken: midtransResult.token,
        paymentUrl: midtransResult.redirectUrl,
        tickets: order.tickets.map(t => ({
          id: t.id,
          ticketCode: t.ticketCode,
          holderName: t.holderName
        }))
      });
    } catch (error) {
      await incrStock(data.categoryId, data.quantity);
      await redis.del(idempotencyKey);
      
      console.error('Order creation failed:', error);
      throw error;
    }
  });
}