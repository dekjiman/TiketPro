import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';

const prisma = new PrismaClient();

const prizeSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  totalWinner: z.number().int().positive(),
  remainingWinner: z.number().int().nonnegative().optional(),
  order: z.number().int().min(1),
});

async function assertEoEventOwnership(userId: string, eventId: string): Promise<boolean> {
  const eoProfile = await prisma.eoProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!eoProfile) return false;
  const event = await prisma.event.findFirst({
    where: { id: eventId, eoId: eoProfile.id },
    select: { id: true },
  });
  return !!event;
}

export async function prizeRoutes(fastify: FastifyInstance) {
  fastify.get('/winners', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const eventId = String((req.query as any)?.eventId || '');
    if (!eventId) return reply.code(400).send({ error: 'eventId is required' });
    const owned = await assertEoEventOwnership(user.id, eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    const winners = await prisma.lotteryPrizeWinner.findMany({
      where: { eventId },
      orderBy: [{ confirmedAt: 'desc' }],
      select: {
        id: true,
        eventId: true,
        prizeId: true,
        ticketId: true,
        ticketCode: true,
        userName: true,
        confirmedAt: true,
        prize: {
          select: {
            name: true,
            order: true,
          },
        },
      },
    });

    return winners;
  });

  fastify.post('/winners/:id/revoke', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const { id } = req.params as any;
    const winner = await prisma.lotteryPrizeWinner.findUnique({
      where: { id },
      select: { id: true, eventId: true, prizeId: true },
    });
    if (!winner) return reply.code(404).send({ error: 'Winner not found' });

    const owned = await assertEoEventOwnership(user.id, winner.eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    await prisma.$transaction(async (tx) => {
      await tx.lotteryPrizeWinner.delete({ where: { id: winner.id } });
      await tx.prize.update({
        where: { id: winner.prizeId },
        data: { remainingWinner: { increment: 1 } },
      });
    });

    return { success: true };
  });

  fastify.post('/upload-image', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const eventId = String((req.query as any)?.eventId || '');
    if (!eventId) return reply.code(400).send({ error: 'eventId is required' });
    const owned = await assertEoEventOwnership(user.id, eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });
    if (!file.mimetype?.startsWith('image/')) {
      return reply.code(400).send({ error: 'Invalid file type. Image only' });
    }

    const uploadDir = path.join(process.cwd(), 'public/uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const fileName = `${eventId}-prize-${Date.now()}.webp`;
    const filePath = path.join(uploadDir, fileName);
    const buffer = await file.toBuffer();

    await sharp(buffer)
      .resize(1600, 900, { fit: 'cover', position: 'attention' })
      .webp({ quality: 86 })
      .toFile(filePath);

    return { url: `/public/uploads/${fileName}` };
  });

  fastify.get('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const eventId = String((req.query as any)?.eventId || '');
    if (!eventId) return reply.code(400).send({ error: 'eventId is required' });
    const owned = await assertEoEventOwnership(user.id, eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    const prizes = await prisma.prize.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
    return prizes;
  });

  fastify.post('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const parsed = prizeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const body = parsed.data;

    const owned = await assertEoEventOwnership(user.id, body.eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    const existingOrder = await prisma.prize.findFirst({
      where: { eventId: body.eventId, order: body.order },
      select: { id: true },
    });
    if (existingOrder) return reply.code(400).send({ error: 'DUPLICATE_PRIZE_ORDER', message: 'Order prize sudah dipakai. Gunakan urutan lain.' });

    const prize = await prisma.prize.create({
      data: {
        eventId: body.eventId,
        name: body.name,
        description: body.description || null,
        imageUrl: body.imageUrl || null,
        totalWinner: body.totalWinner,
        remainingWinner: body.remainingWinner ?? body.totalWinner,
        order: body.order,
      },
    });
    return prize;
  });

  fastify.put('/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const { id } = req.params as any;
    const parsed = prizeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const body = parsed.data;

    const existing = await prisma.prize.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Prize not found' });

    const owned = await assertEoEventOwnership(user.id, existing.eventId);
    if (!owned || existing.eventId !== body.eventId) return reply.code(403).send({ error: 'Access denied' });

    const existingOrder = await prisma.prize.findFirst({
      where: { eventId: body.eventId, order: body.order, id: { not: id } },
      select: { id: true },
    });
    if (existingOrder) return reply.code(400).send({ error: 'DUPLICATE_PRIZE_ORDER', message: 'Order prize sudah dipakai. Gunakan urutan lain.' });

    if ((body.remainingWinner ?? existing.remainingWinner) > body.totalWinner) {
      return reply.code(400).send({ error: 'REMAINING_EXCEEDS_TOTAL', message: 'remainingWinner tidak boleh lebih besar dari totalWinner' });
    }

    const prize = await prisma.prize.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description || null,
        imageUrl: body.imageUrl || null,
        totalWinner: body.totalWinner,
        remainingWinner: body.remainingWinner ?? existing.remainingWinner,
        order: body.order,
      },
    });
    return prize;
  });

  fastify.delete('/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const { id } = req.params as any;
    const existing = await prisma.prize.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Prize not found' });

    const owned = await assertEoEventOwnership(user.id, existing.eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    await prisma.prize.delete({ where: { id } });
    return { success: true };
  });
}
