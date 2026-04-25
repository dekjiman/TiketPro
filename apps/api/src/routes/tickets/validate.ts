import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { decryptQrPayload, verifyQrSignature } from '../../lib/qr.js';
import * as jose from 'jose';
import { env } from '../../config/env.js';

const prisma = new PrismaClient();
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

const QrPayloadSchema = z.object({
  tid: z.string(),
  eid: z.string(),
  cid: z.string(),
  uid: z.string(),
  hn: z.string(),
  iat: z.number(),
  sig: z.string()
});

type QrPayload = z.infer<typeof QrPayloadSchema>;

async function verifyGateToken(token: string): Promise<{ staffId: string; gateId: string; eventId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    if (payload.type !== 'GATE') {
      return null;
    }
    const result: { staffId: string; gateId: string; eventId: string } = {
      staffId: payload.staffId as string,
      gateId: payload.gateId as string,
      eventId: payload.eventId as string
    };
    return result;
  } catch {
    return null;
  }
}

export async function validateTicketRoutes(fastify: FastifyInstance) {
  fastify.get('/validate/:qrEncrypted', async (req, reply) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ valid: false, reason: 'UNAUTHORIZED' });
    }

    const gateToken = authHeader.substring(7);
    const gateAuth = await verifyGateToken(gateToken);
    
    if (!gateAuth) {
      return reply.code(401).send({ valid: false, reason: 'INVALID_GATE_TOKEN' });
    }

    const qrEncrypted = (req.params as any).qrEncrypted;
    let qrPayload: any = null;
    try {
      qrPayload = decryptQrPayload(qrEncrypted);
    } catch {
      return reply.code(400).send({ valid: false, reason: 'INVALID_QR' });
    }

    const qrData = qrPayload;
    if (!qrData) {
      return reply.code(400).send({ valid: false, reason: 'INVALID_QR' });
    }
    if (!verifyQrSignature(qrData)) {
      await createScanLog(gateAuth.staffId, gateAuth.gateId, qrData.tid, 'INVALID', 'TAMPERED_QR');
      return reply.code(400).send({ valid: false, reason: 'TAMPERED_QR' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: qrData.tid },
      include: {
        category: { select: { id: true, name: true, colorHex: true } },
        order: { select: { eventId: true } }
      }
    });

    if (!ticket) {
      await createScanLog(gateAuth.staffId, gateAuth.gateId, qrPayload.tid, 'INVALID', 'TICKET_NOT_FOUND');
      return reply.code(404).send({ valid: false, reason: 'TICKET_NOT_FOUND' });
    }

    if (ticket.status === 'USED') {
      await createScanLog(gateAuth.staffId, gateAuth.gateId, ticket.id, 'INVALID', 'ALREADY_USED');
      return reply.code(400).send({
        valid: false,
        reason: 'ALREADY_USED',
        detail: { usedAt: ticket.usedAt?.toISOString() }
      });
    }

    if (ticket.status === 'REFUNDED') {
      await createScanLog(gateAuth.staffId, gateAuth.gateId, ticket.id, 'INVALID', 'TICKET_REFUNDED');
      return reply.code(400).send({ valid: false, reason: 'TICKET_REFUNDED' });
    }

    if (ticket.status === 'CANCELLED') {
      await createScanLog(gateAuth.staffId, gateAuth.gateId, ticket.id, 'INVALID', 'TICKET_CANCELLED');
      return reply.code(400).send({ valid: false, reason: 'TICKET_CANCELLED' });
    }

    if (ticket.status !== 'ACTIVE') {
      await createScanLog(gateAuth.staffId, gateAuth.gateId, ticket.id, 'INVALID', 'TICKET_INACTIVE');
      return reply.code(400).send({ valid: false, reason: 'TICKET_INACTIVE' });
    }

    const gate = await prisma.gate.findUnique({
      where: { id: gateAuth.gateId },
      select: { categoryIds: true }
    });

    if (gate && !gate.categoryIds.includes(ticket.categoryId)) {
      const allowedGates = await prisma.gate.findMany({
        where: { categoryIds: { has: ticket.categoryId }, eventId: gateAuth.eventId },
        select: { name: true }
      });
      await createScanLog(gateAuth.staffId, gateAuth.gateId, ticket.id, 'INVALID', 'WRONG_GATE');
      return reply.code(400).send({
        valid: false,
        reason: 'WRONG_GATE',
        detail: { allowedGates: allowedGates.map(g => g.name) }
      });
    }

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'USED',
          usedAt: new Date(),
          usedGateId: gateAuth.gateId
        }
      }),
      prisma.scanLog.create({
        data: {
          ticketId: ticket.id,
          gateId: gateAuth.gateId,
          staffId: gateAuth.staffId,
          result: 'SUCCESS'
        }
      })
    ]);

    const event = await prisma.event.findUnique({
      where: { id: ticket.order.eventId },
      select: { title: true }
    });

    return reply.send({
      valid: true,
      ticket: {
        holderName: ticket.holderName,
        categoryName: ticket.category.name,
        categoryColor: ticket.category.colorHex || undefined,
        isInternal: ticket.isInternal,
        ticketCode: ticket.ticketCode,
        eventTitle: event?.title || ''
      }
    });
  });
}

async function createScanLog(staffId: string, gateId: string, ticketId: string, result: string, errorDetail?: string) {
  try {
    await prisma.scanLog.create({
      data: {
        ticketId,
        gateId,
        staffId,
        result: result + (errorDetail ? ` - ${errorDetail}` : '')
      }
    });
  } catch (logError) {
    console.error('Failed to create scan log:', logError);
  }
}