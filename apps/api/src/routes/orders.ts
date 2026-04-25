import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from './auth.js';
import { atomicDecrStock, atomicIncrStock, getStock, createQueue } from '../services/redis.js';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

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
  idempotencyKey: z.string().uuid().optional(),
  referralCode: z.string().optional(),
});

export async function orderRoutes(fastify: FastifyInstance) {
  fastify.post('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const data = orderSchema.parse(req.body);
    const user = req.user as any;

    // Find event by slug
    const event = await prisma.event.findFirst({
      where: { OR: [{ slug: data.eventSlug }, { id: data.eventSlug }] },
    });
    if (!event) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    const idempotencyKey = data.idempotencyKey || uuidv4();
    const existingOrder = await prisma.order.findUnique({
      where: { idempotencyKey },
    });
    if (existingOrder) {
      return { orderId: existingOrder.id, status: existingOrder.status };
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of data.items) {
      const category = await prisma.ticketCategory.findUnique({ where: { id: item.categoryId } });
      if (!category) {
        return reply.code(400).send({ error: `Category ${item.categoryId} not found` });
      }
      totalAmount += category.price * item.qty;

      const currentStock = await getStock(event.id, item.categoryId);
      if (currentStock === null) {
        return reply.code(500).send({ error: 'Stock not initialized' });
      }
      if (currentStock < item.qty) {
        return reply.code(409).send({ error: `Insufficient stock for ${category.name}` });
      }

      const remaining = await atomicDecrStock(event.id, item.categoryId, item.qty);
      if (remaining === null) {
        return reply.code(409).send({ error: 'Tickets sold out' });
      }
    }

    let discountAmount = 0;
    if (data.referralCode) {
      const referrer = await prisma.affiliatePartner.findFirst({
        where: { code: data.referralCode },
        include: { user: true },
      });
      if (referrer) {
        discountAmount = 10000;
      }
    }

    const serviceFee = Math.round(totalAmount * 0.02);
    const finalAmount = totalAmount + serviceFee - discountAmount;

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        totalAmount,
        discountAmount,
        finalAmount,
        idempotencyKey,
        status: 'PENDING',
        expiredAt: new Date(Date.now() + 15 * 60 * 1000),
        paymentMethod: data.paymentMethod,
        items: {
          create: data.items.map(item => ({
            categoryId: item.categoryId,
            qty: item.qty,
            unitPrice: 0, // Will be updated after category lookup
            subtotal: 0,
          })),
        },
      },
      include: { items: { include: { category: true } } },
    });

    // Update item prices and subtotals
    for (const item of order.items) {
      const category = item.category;
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          unitPrice: category.price,
          subtotal: category.price * item.qty,
        },
      });
    }

    for (const item of order.items) {
      await prisma.ticketCategory.update({
        where: { id: item.categoryId },
        data: { sold: { increment: item.qty } },
      });
    }

    const queue = createQueue('order:expire');
    await queue.add('expire', { orderId: order.id }, { delay: 15 * 60 * 1000 });

    // For now, simulate payment URL
    const paymentUrl = `https://payment.example.com/pay/${order.id}`;

    return {
      orderId: order.id,
      paymentUrl,
      expiresAt: order.expiredAt,
    };
  });

  fastify.get('/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    
    const order = await prisma.order.findFirst({
      where: { id, userId: user.id },
      include: { items: { include: { category: true } }, event: true, tickets: true },
    });
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    return order;
  });

  fastify.get('/mine', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const { status } = req.query as any;

    const where: any = { userId: user.id };
    if (status) {
      where.status = status;
    }

    const orders = await prisma.order.findMany({
      where,
      include: { event: { select: { id: true, title: true, slug: true, startDate: true } }, tickets: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders;
  });

  fastify.get('/my-orders', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: { event: { select: { id: true, title: true, slug: true, startDate: true } }, tickets: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders;
  });
}