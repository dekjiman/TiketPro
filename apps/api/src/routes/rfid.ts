import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';

const prisma = new PrismaClient();

export async function rfidRoutes(fastify: FastifyInstance) {
  fastify.post('/encode', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid, ticketId, eventId, cardType } = req.body as any;
    
    const existing = await prisma.rfidCard.findUnique({ where: { uid } });
    if (existing) {
      return reply.code(400).send({ error: 'UID already registered' });
    }

    const card = await prisma.rfidCard.create({
      data: { uid, ticketId, eventId, cardType: cardType || 'WRISTBAND', status: 'INACTIVE' },
    });
    return card;
  });

  fastify.post('/activate', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { cardId } = req.body as any;

    const card = await prisma.rfidCard.update({
      where: { id: cardId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });
    return card;
  });

  fastify.post('/scan', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid, gateId, accessType } = req.body as any;
    const user = req.user as any;

    const card = await prisma.rfidCard.findUnique({
      where: { uid },
      include: { ticket: { include: { category: true } }, event: true },
    });

    if (!card || card.status !== 'ACTIVE') {
      await prisma.rfidScanLog.create({
        data: { cardId: card?.id || '', gateId, staffId: user.id, result: 'INVALID', accessType },
      });
      return reply.code(400).send({ valid: false, error: 'Invalid or inactive card' });
    }

    if (card.ticket?.status === 'CHECKIN') {
      return reply.code(400).send({ valid: false, error: 'Ticket already used' });
    }

    if (card.ticketId) {
      await prisma.ticket.update({
        where: { id: card.ticketId },
        data: { status: 'CHECKIN', usedAt: new Date(), usedGateId: gateId },
      });
    }

    await prisma.rfidScanLog.create({
      data: { cardId: card.id, gateId, staffId: user.id, result: 'VALID', accessType: accessType || 'CHECKIN' },
    });

    return { valid: true, cardId: card.id, balance: card.balance };
  });

  fastify.post('/payment', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid, amount, description, boothId } = req.body as any;

    const card = await prisma.rfidCard.findUnique({ where: { uid } });
    if (!card || card.status !== 'ACTIVE') {
      return reply.code(400).send({ error: 'Invalid card' });
    }
    if (card.balance < amount) {
      return reply.code(400).send({ error: 'Insufficient balance' });
    }

    await prisma.rfidCard.update({
      where: { id: card.id },
      data: { balance: { decrement: amount } },
    });

    const tx = await prisma.rfidTransaction.create({
      data: { cardId: card.id, amount: -amount, description, boothId },
    });
    return tx;
  });

  fastify.post('/topup', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { cardId, amount, method } = req.body as any;
    const user = req.user as any;

    const card = await prisma.rfidCard.update({
      where: { id: cardId },
      data: { balance: { increment: amount } },
    });

    await prisma.rfidTopup.create({
      data: { cardId, amount, method: method || 'CASH', staffId: user.id },
    });

    return card;
  });

  fastify.get('/:uid/balance', async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as any;
    const card = await prisma.rfidCard.findUnique({ where: { uid } });
    if (!card) return reply.code(404).send({ error: 'Card not found' });
    return { uid, balance: card.balance, status: card.status };
  });

  fastify.get('/:uid/history', async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as any;
    const card = await prisma.rfidCard.findUnique({ where: { uid } });
    if (!card) return reply.code(404).send({ error: 'Card not found' });

    const transactions = await prisma.rfidTransaction.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: 'desc' },
    });
    return transactions;
  });

  fastify.get('/snapshot/:eventId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as any;
    const cards = await prisma.rfidCard.findMany({
      where: { eventId, status: 'ACTIVE' },
      select: { uid: true, ticketId: true, balance: true },
    });
    return cards;
  });
}
