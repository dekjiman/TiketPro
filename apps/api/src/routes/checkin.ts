import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from './auth.js';
import { decryptQrPayload, verifyQrSignature } from '../lib/qr.js';

const prisma = new PrismaClient();

const scanSchema = z.object({
  qr: z.string().min(1),
  checkInPointId: z.string().min(1).optional(),
});

const historyQuerySchema = z.object({
  eventId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const summaryQuerySchema = z.object({
  eventId: z.string().min(1),
});

type QrIdentity = {
  ticketCode?: string;
  ticketId?: string;
};

function isTicketIdLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    || /^c[a-z0-9]{20,}$/i.test(value);
}

function extractQrIdentity(qr: string): QrIdentity | null {
  const trimmed = qr.trim();
  if (!trimmed) return null;

  let value = trimmed;
  try {
    const parsedUrl = new URL(trimmed);
    value = parsedUrl.searchParams.get('qrEncrypted') || parsedUrl.searchParams.get('qr') || parsedUrl.pathname.split('/').filter(Boolean).pop() || trimmed;
  } catch {
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const ticketCode =
        typeof parsed?.ticketCode === 'string'
          ? parsed.ticketCode
          : typeof parsed?.data?.ticketCode === 'string'
            ? parsed.data.ticketCode
            : null;
      const ticketId =
        typeof parsed?.ticketId === 'string'
          ? parsed.ticketId
          : typeof parsed?.tid === 'string'
            ? parsed.tid
            : typeof parsed?.data?.ticketId === 'string'
              ? parsed.data.ticketId
              : typeof parsed?.data?.tid === 'string'
                ? parsed.data.tid
                : null;
      if (ticketCode?.trim()) return { ticketCode: ticketCode.trim() };
      if (ticketId?.trim()) return { ticketId: ticketId.trim() };
      return null;
    } catch {
      return null;
    }
  }

  try {
    const payload = decryptQrPayload(value);
    if (verifyQrSignature(payload)) {
      return { ticketId: payload.tid };
    }
  } catch {
  }

  if (isTicketIdLike(value)) {
    return { ticketId: value };
  }

  return { ticketCode: value };
}

function isStaff(user: any): boolean {
  return user?.role === 'EO_ADMIN' || user?.role === 'EO_STAFF' || user?.role === 'SUPER_ADMIN';
}

async function resolveEoIdForStaff(user: any): Promise<string | null> {
  if (user?.role === 'EO_ADMIN') {
    const eoProfile = await prisma.eoProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return eoProfile?.id || null;
  }

  if (user?.role === 'EO_STAFF') {
    const invite = await prisma.staffInvite.findFirst({
      where: { email: user.email?.toLowerCase(), status: 'ACCEPTED' },
      orderBy: { createdAt: 'desc' },
      select: { eoId: true },
    });
    return invite?.eoId || null;
  }

  return null;
}

export async function checkinRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/scan', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!isStaff(user)) {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', code: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const { qr, checkInPointId } = parsed.data;
    const qrIdentity = extractQrIdentity(qr);
    if (!qrIdentity) {
      return reply.code(400).send({ status: 'INVALID', message: 'Tiket tidak valid' });
    }

    const gate = checkInPointId
      ? await prisma.gate.findFirst({
          where: { id: checkInPointId, isActive: true },
          select: { id: true, name: true, eventId: true, categoryIds: true },
        })
      : null;
    if (checkInPointId && !gate) {
      return reply.code(404).send({ status: 'INVALID', message: 'Check-in point tidak ditemukan' });
    }

    const ticket = await prisma.ticket.findFirst({
      where: qrIdentity.ticketId ? { id: qrIdentity.ticketId } : { ticketCode: qrIdentity.ticketCode! },
      include: {
        category: { select: { id: true, name: true } },
        order: { select: { eventId: true, event: { select: { id: true, title: true } } } },
      },
    });

    if (!ticket) {
      return reply.code(200).send({ status: 'INVALID', message: 'Tiket tidak valid' });
    }

    // Ensure ticket belongs to same event as gate.
    const ticketEventId = ticket.order?.eventId || ticket.eventId;
    if (gate && ticketEventId && ticketEventId !== gate.eventId) {
      await prisma.scanLog.create({ data: { ticketId: ticket.id, gateId: gate.id, staffId: user.id, result: 'WRONG_EVENT' } });
      return reply.code(200).send({ status: 'INVALID', message: 'Tiket tidak valid' });
    }

    if (gate && !gate.categoryIds.includes(ticket.categoryId)) {
      await prisma.scanLog.create({ data: { ticketId: ticket.id, gateId: gate.id, staffId: user.id, result: 'WRONG_GATE' } });
      return reply.code(200).send({ status: 'INVALID', message: 'Tiket tidak valid' });
    }

    if (ticket.status === TicketStatus.CANCELLED || ticket.status === TicketStatus.REFUNDED) {
      if (gate) {
        await prisma.scanLog.create({ data: { ticketId: ticket.id, gateId: gate.id, staffId: user.id, result: 'CANCELLED' } });
      }
      return reply.code(200).send({ status: 'INVALID', message: 'Tiket tidak valid' });
    }

    if (ticket.status === TicketStatus.CHECKIN) {
      if (gate) {
        await prisma.scanLog.create({ data: { ticketId: ticket.id, gateId: gate.id, staffId: user.id, result: 'ALREADY_USED' } });
      }
      return reply.code(200).send({ status: 'CHECKIN', message: 'Tiket sudah checkin' });
    }

    if (ticket.status !== TicketStatus.ACTIVE) {
      if (gate) {
        await prisma.scanLog.create({ data: { ticketId: ticket.id, gateId: gate.id, staffId: user.id, result: 'INACTIVE' } });
      }
      return reply.code(200).send({ status: 'INVALID', message: 'Tiket tidak valid' });
    }

    const usedAt = new Date();
    const writeOperations: any[] = [
      prisma.ticket.updateMany({
        where: { id: ticket.id, status: TicketStatus.ACTIVE, usedAt: null },
        data: { status: TicketStatus.CHECKIN, usedAt, usedGateId: gate?.id || null },
      }),
    ];
    if (gate) {
      writeOperations.push(
        prisma.scanLog.create({
          data: { ticketId: ticket.id, gateId: gate.id, staffId: user.id, result: 'SUCCESS' },
        })
      );
    }
    const [updateResult] = await prisma.$transaction(writeOperations);

    if (updateResult.count === 0) {
      return reply.code(200).send({ status: 'CHECKIN', message: 'Tiket sudah checkin' });
    }

    return reply.code(200).send({
      status: 'VALID',
      name: ticket.holderName,
      category: ticket.category?.name || '',
      message: 'Check-in berhasil',
    });
  });

  fastify.get('/history', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!isStaff(user)) {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', code: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    const { eventId, limit, page } = parsed.data;
    const skip = (page - 1) * limit;

    const eoId = await resolveEoIdForStaff(user);
    if (user.role !== 'SUPER_ADMIN' && !eoId) {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const logs = await prisma.scanLog.findMany({
      where: user.role === 'SUPER_ADMIN'
        ? (eventId ? { gate: { eventId } } : undefined)
        : {
            gate: {
              ...(eventId ? { eventId } : {}),
              event: { eoId: eoId! },
            },
          },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
      include: {
        gate: { select: { id: true, name: true, eventId: true } },
        ticket: { select: { ticketCode: true, holderName: true, category: { select: { name: true } } } },
      },
    });

    return reply.code(200).send({
      data: logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        result: l.result,
        gate: { id: l.gateId, name: l.gate?.name || '' },
        ticket: l.ticket
          ? { ticketCode: l.ticket.ticketCode, holderName: l.ticket.holderName, category: l.ticket.category?.name || '' }
          : null,
      })),
      page,
      limit,
    });
  });

  fastify.get('/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!isStaff(user)) {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const parsed = summaryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', code: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    const { eventId } = parsed.data;

    const eoId = await resolveEoIdForStaff(user);
    if (user.role !== 'SUPER_ADMIN') {
      if (!eoId) {
        return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
      }
      const allowedEvent = await prisma.event.findFirst({ where: { id: eventId, eoId }, select: { id: true } });
      if (!allowedEvent) {
        return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
      }
    }

    const [total, used, active] = await Promise.all([
      prisma.ticket.count({ where: { order: { eventId } } }),
      prisma.ticket.count({ where: { order: { eventId }, status: TicketStatus.CHECKIN } }),
      prisma.ticket.count({ where: { order: { eventId }, status: TicketStatus.ACTIVE } }),
    ]);

    return reply.code(200).send({
      eventId,
      totalTickets: total,
      checkedIn: used,
      remaining: active,
    });
  });
}
