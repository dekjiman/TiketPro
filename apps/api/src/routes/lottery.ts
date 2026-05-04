import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';
import crypto from 'crypto';
import { z } from 'zod';

const prisma = new PrismaClient();
const pendingPickMap = new Map<string, { ticketId: string; pickedAt: number }>();

function isLotteryAdmin(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'EO_ADMIN';
}

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
  const lotteryConfigSchema = z.object({
    eventId: z.string().min(1),
    isEnabled: z.boolean(),
    drawMode: z.enum(['BATCH', 'LIVE']),
    allowMultipleWin: z.boolean(),
    eligibleStatus: z.literal('CHECKED_IN').default('CHECKED_IN'),
    maxWinnerPerTicket: z.number().int().min(1).default(1),
    cooldownSeconds: z.number().int().min(0).default(3),
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

  fastify.get('/config', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const eventId = String((req.query as any)?.eventId || '');
    if (!eventId) return reply.code(400).send({ error: 'eventId is required' });

    const owned = await assertEoEventOwnership(user.id, eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    const [config, eligibleCount, prizes] = await Promise.all([
      prisma.lotteryConfig.findUnique({ where: { eventId } }),
      prisma.ticket.count({ where: { order: { eventId }, status: 'CHECKIN' as any } }),
      prisma.prize.findMany({ where: { eventId }, orderBy: { order: 'asc' } }),
    ]);

    return {
      config: config || {
        id: null,
        eventId,
        isEnabled: false,
        drawMode: 'LIVE',
        allowMultipleWin: false,
        eligibleStatus: 'CHECKED_IN',
        maxWinnerPerTicket: 1,
        cooldownSeconds: 3,
      },
      meta: {
        eligibleCount,
        hasRemainingPrize: prizes.some((p) => p.remainingWinner > 0),
      },
    };
  });

  fastify.post('/config', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const parsed = lotteryConfigSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const body = parsed.data;

    const owned = await assertEoEventOwnership(user.id, body.eventId);
    if (!owned) return reply.code(403).send({ error: 'Access denied' });

    const [prizeCount, duplicateOrderCount, eligibleCount, remainingCount] = await Promise.all([
      prisma.prize.count({ where: { eventId: body.eventId } }),
      prisma.$queryRawUnsafe<any[]>(`SELECT "order" FROM "Prize" WHERE "eventId" = $1 GROUP BY "order" HAVING COUNT(*) > 1`, body.eventId).then((r) => r.length),
      prisma.ticket.count({ where: { order: { eventId: body.eventId }, status: 'CHECKIN' as any } }),
      prisma.prize.count({ where: { eventId: body.eventId, remainingWinner: { gt: 0 } } }),
    ]);

    if (prizeCount < 1) return reply.code(400).send({ error: 'AT_LEAST_ONE_PRIZE_REQUIRED' });
    if (duplicateOrderCount > 0) return reply.code(400).send({ error: 'DUPLICATE_PRIZE_ORDER' });
    if (body.isEnabled && eligibleCount < 1) return reply.code(400).send({ error: 'NO_ELIGIBLE_CHECKIN_TICKETS' });
    if (body.isEnabled && remainingCount < 1) return reply.code(400).send({ error: 'NO_REMAINING_PRIZE' });

    const config = await prisma.lotteryConfig.create({ data: body });
    return config;
  });

  fastify.put('/config/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (user.role !== 'EO_ADMIN') return reply.code(403).send({ error: 'Forbidden' });

    const { id } = req.params as any;
    const parsed = lotteryConfigSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const body = parsed.data;

    const existing = await prisma.lotteryConfig.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Config not found' });

    const owned = await assertEoEventOwnership(user.id, existing.eventId);
    if (!owned || existing.eventId !== body.eventId) return reply.code(403).send({ error: 'Access denied' });

    const [prizeCount, duplicateOrderCount, eligibleCount, remainingCount] = await Promise.all([
      prisma.prize.count({ where: { eventId: body.eventId } }),
      prisma.$queryRawUnsafe<any[]>(`SELECT "order" FROM "Prize" WHERE "eventId" = $1 GROUP BY "order" HAVING COUNT(*) > 1`, body.eventId).then((r) => r.length),
      prisma.ticket.count({ where: { order: { eventId: body.eventId }, status: 'CHECKIN' as any } }),
      prisma.prize.count({ where: { eventId: body.eventId, remainingWinner: { gt: 0 } } }),
    ]);

    if (prizeCount < 1) return reply.code(400).send({ error: 'AT_LEAST_ONE_PRIZE_REQUIRED' });
    if (duplicateOrderCount > 0) return reply.code(400).send({ error: 'DUPLICATE_PRIZE_ORDER' });
    if (body.isEnabled && eligibleCount < 1) return reply.code(400).send({ error: 'NO_ELIGIBLE_CHECKIN_TICKETS' });
    if (body.isEnabled && remainingCount < 1) return reply.code(400).send({ error: 'NO_REMAINING_PRIZE' });

    const config = await prisma.lotteryConfig.update({ where: { id }, data: body });
    return config;
  });

  fastify.get('/by-event/:eventId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!isLotteryAdmin(user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { eventId } = req.params as any;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    // Source of truth for Big Screen should be Prize settings module
    const [prizeRows, winnerRows] = await Promise.all([
      prisma.prize.findMany({
        where: { eventId },
        orderBy: { order: 'asc' },
      }),
      prisma.lotteryPrizeWinner.findMany({
        where: { eventId },
        orderBy: { confirmedAt: 'asc' },
        select: {
          prizeId: true,
          ticketId: true,
          ticketCode: true,
          userName: true,
          confirmedAt: true,
        },
      }),
    ]);

    const winnersByPrize = winnerRows.reduce<Record<string, Array<{
      ticketId: string;
      ticketCode: string;
      userName: string;
      confirmedAt: string;
    }>>>((acc, row) => {
      if (!acc[row.prizeId]) acc[row.prizeId] = [];
      acc[row.prizeId].push({
        ticketId: row.ticketId,
        ticketCode: row.ticketCode,
        userName: row.userName,
        confirmedAt: row.confirmedAt.toISOString(),
      });
      return acc;
    }, {});

    const prizes = prizeRows.map((prize) => ({
      id: prize.id,
      prizeId: prize.id,
      name: prize.name,
      imageUrl: prize.imageUrl || '',
      quota: prize.totalWinner,
      remainingQuota: prize.remainingWinner,
      order: prize.order,
      description: prize.description || '',
      winners: winnersByPrize[prize.id] || [],
    }));

    return {
      lotteryId: null,
      event,
      prizes,
    };
  });

  fastify.post('/pick-one', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!isLotteryAdmin(user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { eventId, prizeId } = req.body as { eventId?: string; prizeId?: string };
    if (!eventId || !prizeId) {
      return reply.code(400).send({ error: 'eventId and prizeId are required' });
    }

    if (user.role === 'EO_ADMIN') {
      const owned = await assertEoEventOwnership(user.id, eventId);
      if (!owned) return reply.code(403).send({ error: 'Access denied' });
    }

    const prize = await prisma.prize.findFirst({
      where: { id: prizeId, eventId },
      select: { id: true, remainingWinner: true },
    });
    if (!prize) return reply.code(404).send({ error: 'PRIZE_NOT_FOUND' });
    if (prize.remainingWinner <= 0) {
      return reply.code(400).send({ error: 'PRIZE_QUOTA_EMPTY' });
    }

    const winnerTicketRows = await prisma.lotteryPrizeWinner.findMany({
      where: { eventId },
      select: { ticketId: true },
    });
    const winnerTicketIdSet = new Set(winnerTicketRows.map((row) => row.ticketId));

    const pool = await prisma.ticket.findMany({
      where: {
        order: { eventId },
        status: 'CHECKIN' as any,
      },
      select: { id: true, ticketCode: true, holderName: true },
    });
    const filteredPool = pool.filter((item) => !winnerTicketIdSet.has(item.id));

    if (filteredPool.length === 0) {
      return reply.code(404).send({ error: 'NO_ELIGIBLE_PARTICIPANTS' });
    }

    const shuffled = fisherYatesShuffle(filteredPool);
    const selected = shuffled[0];
    const pendingKey = `${eventId}:${prizeId}`;
    pendingPickMap.set(pendingKey, { ticketId: selected.id, pickedAt: Date.now() });

    return {
      ticketId: selected.id,
      ticketCode: selected.ticketCode,
      userName: selected.holderName || 'Participant',
    };
  });

  fastify.post('/confirm', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!isLotteryAdmin(user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { ticketId, prizeId, eventId } = req.body as { ticketId?: string; prizeId?: string; eventId?: string };
    if (!ticketId || !prizeId || !eventId) {
      return reply.code(400).send({ error: 'ticketId, prizeId, and eventId are required' });
    }

    const pendingKey = `${eventId}:${prizeId}`;
    if (user.role === 'EO_ADMIN') {
      const owned = await assertEoEventOwnership(user.id, eventId);
      if (!owned) return reply.code(403).send({ error: 'Access denied' });
    }

    const pendingPick = pendingPickMap.get(pendingKey);
    if (pendingPick && pendingPick.ticketId !== ticketId) {
      return reply.code(400).send({ error: 'PICK_MISMATCH' });
    }

    const prize = await prisma.prize.findFirst({
      where: { id: prizeId, eventId },
      select: { id: true, remainingWinner: true },
    });
    if (!prize) return reply.code(404).send({ error: 'PRIZE_NOT_FOUND' });
    if (prize.remainingWinner <= 0) {
      return reply.code(400).send({ error: 'PRIZE_QUOTA_EMPTY' });
    }

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, order: { eventId }, status: 'CHECKIN' as any },
      select: { id: true, ticketCode: true, holderName: true },
    });
    if (!ticket) return reply.code(404).send({ error: 'TICKET_NOT_ELIGIBLE' });

    const duplicateWinner = await prisma.lotteryPrizeWinner.findFirst({
      where: { eventId, ticketId },
      select: { id: true },
    });
    if (duplicateWinner) {
      return reply.code(400).send({ error: 'TICKET_ALREADY_WON' });
    }

    let txResult: { ok: boolean };
    try {
      txResult = await prisma.$transaction(async (tx) => {
        const updatedPrize = await tx.prize.updateMany({
          where: { id: prize.id, remainingWinner: { gt: 0 } },
          data: {
            remainingWinner: { decrement: 1 },
          },
        });
        if (updatedPrize.count !== 1) {
          throw new Error('PRIZE_QUOTA_EMPTY');
        }

        await tx.lotteryPrizeWinner.create({
          data: {
            eventId,
            prizeId,
            ticketId: ticket.id,
            ticketCode: ticket.ticketCode,
            userName: ticket.holderName || 'Participant',
          },
        });
        return { ok: true };
      });
    } catch (error: any) {
      if (error?.message === 'PRIZE_QUOTA_EMPTY') {
        return reply.code(400).send({ error: 'PRIZE_QUOTA_EMPTY' });
      }
      if (error?.code === 'P2002') {
        return reply.code(400).send({ error: 'TICKET_ALREADY_WON' });
      }
      throw error;
    }

    const lottery = await prisma.lotteryEvent.findFirst({ where: { eventId }, select: { id: true } });
    if (lottery) {
      await prisma.lotteryAuditLog.create({
        data: {
          lotteryId: lottery.id,
          action: 'CONFIRM_WINNER',
          detail: JSON.stringify({ eventId, prizeId, ticketId, ticketCode: ticket.ticketCode }),
          entropy: crypto.randomBytes(16).toString('hex'),
        },
      });
    }

    pendingPickMap.delete(pendingKey);
    return txResult;
  });

  fastify.post('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!isLotteryAdmin(user.role)) {
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
