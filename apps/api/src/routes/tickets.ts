import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';
import { z } from 'zod';
import { decryptQrPayload, verifyQrSignature, AppError } from '../lib/qr.js';

const prisma = new PrismaClient();

export async function ticketRoutes(fastify: FastifyInstance) {
  // NOTE: Prefer using `/api/eo/scanner/validate` (role + ownership enforced).
  // This route is kept for backward compatibility but is now secured.
  const validateSchema = z.object({
    gateId: z.string().min(1),
    qrEncrypted: z.string().min(10),
  });

  const resolveEoId = async (user: any): Promise<string | null> => {
    if (user.role === 'EO_ADMIN') {
      const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
      return eoProfile?.id || null;
    }
    if (user.role === 'EO_STAFF') {
      const invite = await (prisma as any).staffInvite.findFirst({
        where: { email: user.email?.toLowerCase(), status: 'ACCEPTED' },
        orderBy: { createdAt: 'desc' },
        select: { eoId: true },
      });
      return invite?.eoId || null;
    }
    return null;
  };

  fastify.post('/validate', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!user || (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF')) {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', code: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const { gateId, qrEncrypted } = parsed.data;
    const eoId = await resolveEoId(user);
    if (!eoId) {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const gate = await (prisma as any).gate.findFirst({
      where: { id: gateId, isActive: true, event: { eoId } },
      select: { id: true, eventId: true, categoryIds: true },
    });
    if (!gate) {
      return reply.code(404).send({ error: 'Gate not found', code: 'GATE_NOT_FOUND' });
    }

    let payload: any;
    try {
      payload = decryptQrPayload(qrEncrypted);
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'INVALID_QR';
      const status = err instanceof AppError ? err.httpStatus : 400;
      return reply.code(status).send({ valid: false, reason: code, code, error: 'QR code tidak valid' });
    }

    if (!verifyQrSignature(payload)) {
      return reply.code(400).send({ valid: false, reason: 'TAMPERED_QR', code: 'TAMPERED_QR', error: 'QR code tidak valid' });
    }

    if (payload.eid !== gate.eventId) {
      return reply.code(400).send({ valid: false, reason: 'WRONG_EVENT', code: 'WRONG_EVENT', error: 'QR bukan untuk event ini' });
    }

    const ticket = await (prisma as any).ticket.findFirst({
      where: { id: payload.tid },
      include: { category: true, order: { select: { eventId: true } } },
    });
    if (!ticket || ticket.order?.eventId !== gate.eventId) {
      return reply.code(404).send({ valid: false, reason: 'TICKET_NOT_FOUND', code: 'TICKET_NOT_FOUND', error: 'Ticket tidak ditemukan' });
    }

    if (ticket.status === 'CHECKIN') {
      return reply.code(400).send({ valid: false, reason: 'ALREADY_USED', code: 'ALREADY_USED', error: 'Ticket sudah digunakan' });
    }

    if (ticket.status !== 'ACTIVE') {
      return reply.code(400).send({ valid: false, reason: 'TICKET_INACTIVE', code: 'TICKET_INACTIVE', error: 'Ticket tidak aktif' });
    }

    if (!gate.categoryIds.includes(ticket.categoryId)) {
      return reply.code(400).send({ valid: false, reason: 'WRONG_GATE', code: 'WRONG_GATE', error: 'Gate tidak sesuai kategori ticket' });
    }

    const usedAt = new Date();
    const [updateResult] = await (prisma as any).$transaction([
      (prisma as any).ticket.updateMany({
        where: { id: ticket.id, status: 'ACTIVE', usedAt: null },
        data: { status: 'CHECKIN', usedAt, usedGateId: gate.id },
      }),
      (prisma as any).scanLog.create({
        data: { ticketId: ticket.id, gateId: gate.id, staffId: user.id, result: 'SUCCESS' },
      }),
    ]);

    if (!updateResult || updateResult.count !== 1) {
      return reply.code(409).send({ valid: false, reason: 'CONFLICT', code: 'CONFLICT', error: 'Ticket sudah diproses oleh device lain' });
    }

    return {
      valid: true,
      ticket: { id: ticket.id, holderName: ticket.holderName, category: ticket.category?.name || '' },
    };
  });


}
