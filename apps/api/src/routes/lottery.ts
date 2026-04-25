import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

function fisherYatesShuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const randomBytes = crypto.randomBytes(4);
    const randomIndex = randomBytes.readUInt32BE(0) % (i + 1);
    [arr[i], arr[randomIndex]] = [arr[randomIndex], arr[i]];
  }
  return arr;
}

export async function lotteryRoutes(fastify: FastifyInstance) {
  fastify.post('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!['SUPER_ADMIN', 'EO_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { eventId, name, description, registrationStart, registrationEnd, drawDate, purchaseDeadlineHours, slots } = req.body as any;

    const lottery = await prisma.lotteryEvent.create({
      data: {
        eventId,
        name,
        description,
        registrationStart: new Date(registrationStart),
        registrationEnd: new Date(registrationEnd),
        drawDate: new Date(drawDate),
        purchaseDeadlineHours: purchaseDeadlineHours || 24,
        slots: { create: slots },
      },
      include: { slots: true },
    });

    return lottery;
  });

  fastify.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const lottery = await prisma.lotteryEvent.findUnique({
      where: { id },
      include: { slots: true, event: true },
    });
    if (!lottery) return reply.code(404).send({ error: 'Lottery not found' });
    
    const entryCount = await prisma.lotteryEntry.count({ where: { lotteryId: id } });
    return { ...lottery, entryCount };
  });

  fastify.post('/:id/register', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { preference1, preference2 } = req.body as any;

    const lottery = await prisma.lotteryEvent.findUnique({ where: { id } });
    if (!lottery) return reply.code(404).send({ error: 'Lottery not found' });
    if (new Date() < lottery.registrationStart || new Date() > lottery.registrationEnd) {
      return reply.code(400).send({ error: 'Registration period closed' });
    }

    const existing = await prisma.lotteryEntry.findFirst({ where: { lotteryId: id, userId: user.id } });
    if (existing) {
      return reply.code(400).send({ error: 'Already registered' });
    }

    const entry = await prisma.lotteryEntry.create({
      data: { lotteryId: id, userId: user.id, preference1, preference2 },
    });

    return entry;
  });

  fastify.get('/:id/my-entry', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    const entry = await prisma.lotteryEntry.findFirst({
      where: { lotteryId: id, userId: user.id },
      include: { lottery: true },
    });
    if (!entry) return reply.code(404).send({ error: 'No entry found' });
    return entry;
  });

  fastify.post('/:id/draw', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;

    const lottery = await prisma.lotteryEvent.findUnique({
      where: { id },
      include: { slots: true },
    });
    if (!lottery) return reply.code(404).send({ error: 'Lottery not found' });
    if (lottery.status !== 'UPCOMING') {
      return reply.code(400).send({ error: 'Draw already completed' });
    }

    await prisma.lotteryEvent.update({ where: { id }, data: { status: 'DRAWING' } });

    const entries = await prisma.lotteryEntry.findMany({ where: { lotteryId: id, status: 'REGISTERED' } });
    const shuffled = fisherYatesShuffle(entries);

    const totalQuota = lottery.slots.reduce((sum, s) => sum + s.quota, 0);
    const winners = shuffled.slice(0, totalQuota);
    const waitlist = shuffled.slice(totalQuota);

    const entropy = crypto.randomBytes(32).toString('hex');
    await prisma.lotteryAuditLog.create({
      data: { lotteryId: id, action: 'DRAW_COMPLETE', detail: JSON.stringify({ winners: winners.length, waitlist: waitlist.length }), entropy },
    });

    for (let i = 0; i < winners.length; i++) {
      const entry = winners[i];
      const deadline = new Date(Date.now() + lottery.purchaseDeadlineHours * 60 * 60 * 1000);
      await prisma.lotteryEntry.update({
        where: { id: entry.id },
        data: { status: 'WINNER', drawPosition: i + 1, purchaseDeadline: deadline, notifiedAt: new Date() },
      });
    }

    for (let i = 0; i < waitlist.length; i++) {
      await prisma.lotteryEntry.update({
        where: { id: waitlist[i].id },
        data: { status: 'WAITLIST', waitlistPosition: i + 1 },
      });
    }

    await prisma.lotteryEvent.update({ where: { id }, data: { status: 'COMPLETED' } });

    return { winners: winners.length, waitlist: waitlist.length };
  });

  fastify.get('/:id/results', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const lottery = await prisma.lotteryEvent.findUnique({ where: { id } });
    if (!lottery?.isPublicResult) return reply.code(403).send({ error: 'Results not public' });

    const winners = await prisma.lotteryEntry.findMany({
      where: { lotteryId: id, status: 'WINNER' },
      include: { user: { select: { name: true } } },
    });
    return winners;
  });

  fastify.get('/:id/audit', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const logs = await prisma.lotteryAuditLog.findMany({ where: { lotteryId: id }, orderBy: { createdAt: 'asc' } });
    return logs;
  });

  fastify.get('/:id/stats', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const total = await prisma.lotteryEntry.count({ where: { lotteryId: id } });
    const winners = await prisma.lotteryEntry.count({ where: { lotteryId: id, status: 'WINNER' } });
    const paid = await prisma.lotteryEntry.count({ where: { lotteryId: id, status: 'PAID' } });
    const waitlist = await prisma.lotteryEntry.count({ where: { lotteryId: id, status: 'WAITLIST' } });

    return { total, winners, paid, waitlist, conversionRate: winners > 0 ? (paid / winners * 100).toFixed(2) + '%' : '0%' };
  });
}