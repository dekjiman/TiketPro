import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { redis } from '../../services/redis.js';
import { env } from '../../config/env.js';

const prisma = new PrismaClient();

const RESEND_LIMIT = 3;
const RESEND_WINDOW_HOURS = 24;

const ResendChannelSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'both'])
});

async function getPresignedUrl(r2Key: string, expiresInSeconds: number = 3600): Promise<string> {
  throw new Error('R2 presigned URL not implemented');
}

async function addResendJob(ticketId: string, channel: string) {
  const queue = new (await import('bullmq')).Queue('ticket:resend', { connection: redis });
  await queue.add('resend', { ticketId, channel });
}

function getTicketResendKey(ticketId: string): string {
  return `ticket_resend:${ticketId}`;
}

export async function ticketRoutes(fastify: FastifyInstance) {
  fastify.get('/mine', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
        }
      }
    }
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
    const userId = user?.id;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, colorHex: true } },
          order: {
            select: { id: true },
            include: {
              event: { select: { id: true, title: true, slug: true, startDate: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.ticket.count({ where })
    ]);

    return {
      tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  });

  fastify.get('/:ticketId', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { ticketId } = req.params as Record<string, string>;
    const userId = user?.id;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        category: true,
        order: {
          include: {
            event: { include: { venues: true } }
          }
        }
      }
    });

    if (!ticket) {
      return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    }

    if (ticket.userId !== userId) {
      return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });
    }

    const { qrEncrypted, ...safeTicket } = ticket;
    return safeTicket;
  });

  fastify.get('/:ticketId/download', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { ticketId } = req.params as Record<string, string>;
    const userId = user?.id;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, pdfUrl: true, ticketCode: true }
    });

    if (!ticket) {
      return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    }

    if (ticket.userId !== userId) {
      return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });
    }

    if (!ticket.pdfUrl) {
      return reply.code(404).send({ error: 'PDF_NOT_FOUND', message: 'PDF belum tersedia' });
    }

    let downloadUrl = ticket.pdfUrl;

    if (ticket.pdfUrl.includes('r2') || ticket.pdfUrl.includes('cloudflar')) {
      try {
        downloadUrl = await getPresignedUrl(ticket.pdfUrl, 3600);
      } catch (error) {
        console.error('Failed to generate presigned URL:', error);
        downloadUrl = ticket.pdfUrl;
      }
    }

    console.log(`[TICKET_DOWNLOAD] ticketId=${ticketId}, userId=${userId}, code=${ticket.ticketCode}`);

    return reply.redirect(302, downloadUrl);
  });

  fastify.post('/:ticketId/resend', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { ticketId } = req.params as Record<string, string>;
    const userId = user?.id;
    const body = ResendChannelSchema.parse(req.body);

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, status: true }
    });

    if (!ticket) {
      return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    }

    if (ticket.userId !== userId) {
      return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });
    }

    if (ticket.status !== 'ACTIVE') {
      return reply.code(400).send({ error: 'TICKET_NOT_ACTIVE', message: 'Tiket tidak aktif, tidak dapat dikirim ulang' });
    }

    const resendKey = getTicketResendKey(ticketId);
    const recentResends = await redis.get(resendKey);
    const resendCount = recentResends ? parseInt(recentResends) : 0;

    if (resendCount >= RESEND_LIMIT) {
      return reply.code(400).send({
        error: 'RESEND_RATE_LIMIT',
        message: `Terlalu banyak permintaan. Maksimum ${RESEND_LIMIT} kali dalam ${RESEND_WINDOW_HOURS} jam.`
      });
    }

    await redis.set(resendKey, resendCount + 1, 'EX', RESEND_WINDOW_HOURS * 3600);
    await addResendJob(ticketId, body.channel);

    return reply.code(200).send({ message: 'Tiket sedang dikirim ulang' });
  });
}