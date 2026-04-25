import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

export async function ticketRoutes(fastify: FastifyInstance) {
  fastify.get('/:qrCode', async (req: FastifyRequest, reply: FastifyReply) => {
    const { qrCode } = req.params as any;
    const ticket = await prisma.ticket.findUnique({
      where: { qrCode },
      include: { category: true, user: { select: { name: true, email: true } }, order: { include: { event: true } } },
    });
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
    return ticket;
  });

  fastify.post('/validate', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { qrCode, gateId } = req.body as any;
    const user = req.user as any;

    const ticket = await prisma.ticket.findUnique({
      where: { qrCode },
      include: { category: true, order: { include: { event: true } } },
    });
    if (!ticket) {
      return reply.code(404).send({ valid: false, error: 'Ticket not found' });
    }
    if (ticket.status === 'USED') {
      return reply.code(400).send({ valid: false, error: 'Ticket already used', usedAt: ticket.checkedInAt });
    }
    if (ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED') {
      return reply.code(400).send({ valid: false, error: 'Ticket invalid' });
    }

    const gate = await prisma.gate.findUnique({ where: { id: gateId } });
    if (gate && !gate.categoryIds.includes(ticket.categoryId)) {
      return reply.code(400).send({ valid: false, error: 'Wrong gate for ticket category' });
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED', checkedInAt: new Date() },
    });

    await prisma.scanLog.create({
      data: { ticketId: ticket.id, gateId, staffId: user.id, result: 'VALID' },
    });

    return { valid: true, ticket: { id: ticket.id, holderName: ticket.holderName, category: ticket.category.name } };
  });

  fastify.get('/:id/download', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId: user.id },
      include: { category: true, order: { include: { event: true } } },
    });
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });

    return { pdfUrl: ticket.pdfUrl || null, qrCode: ticket.qrCode };
  });
}