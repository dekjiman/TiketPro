import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { redis } from '../../services/redis.js';
import { env } from '../../config/env.js';
import { authenticate } from '../auth.js';

const prisma = new PrismaClient();

const RESEND_LIMIT = 10;
const RESEND_WINDOW_HOURS = 24;

const ResendChannelSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'both'])
});

async function getPresignedUrl(r2Key: string, expiresInSeconds: number = 3600): Promise<string> {
  throw new Error('R2 presigned URL not implemented');
}

async function addResendJob(ticketId: string, channel: string) {
  const { createQueue, Queues } = await import('../../services/redis.js');
  const queue = createQueue(Queues.TICKET_RESEND);
  await queue.add('resend', { ticketId, channel });
}

async function sendTransferInvitationEmail(params: {
  to: string;
  senderName: string;
  eventName: string;
  ticketCode: string;
  transferId: string;
  message?: string | null;
}) {
  const { sendTicketTransferEmail } = await import('../../services/email.js');
  const transferUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/dashboard/my-tickets/transfers/${params.transferId}`;

  await sendTicketTransferEmail({
    to: params.to,
    senderName: params.senderName,
    eventName: params.eventName,
    ticketCode: params.ticketCode,
    transferUrl,
    message: params.message || undefined
  }).catch(err => console.error('Failed to send transfer email:', err));
}

function getTicketResendKey(ticketId: string): string {
  return `ticket_resend:${ticketId}`;
}

export async function ticketRoutes(fastify: FastifyInstance) {
  // Debug routes - only available in development
  if (process.env.NODE_ENV === 'development') {
    fastify.get('/debug/all', async (req: FastifyRequest, reply: FastifyReply) => {
      const tickets = await prisma.ticket.findMany({
        select: { id: true, ticketCode: true, status: true, pdfUrl: true, userId: true, createdAt: true, generatedAt: true }
      });
      return { tickets };
    });

    fastify.post('/debug/regenerate/:ticketId', async (req: FastifyRequest, reply: FastifyReply) => {
      const { ticketId } = req.params as Record<string, string>;

      try {
        const ticket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          include: {
            category: true,
            order: {
              include: {
                event: {
                  include: {
                    venues: true,
                    eo: true
                  }
                }
              }
            }
          }
        });

        if (!ticket || !ticket.order) {
          return reply.code(404).send({ error: 'Ticket or order not found' });
        }

        // Trigger the worker manually
        const { createQueue, Queues } = await import('../../services/redis.js');
        const queue = createQueue(Queues.TICKET_GENERATE);
        await queue.add('generate', { orderId: ticket.order.id });

        return { message: 'PDF regeneration enqueued', ticketId, orderId: ticket.order.id };
      } catch (error) {
        console.error('Failed to regenerate PDF:', error);
        return reply.code(500).send({ error: 'Failed to regenerate PDF' });
      }
    });
  }

  fastify.get('/mine', {
    preHandler: [authenticate],
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
            include: {
              event: { select: { id: true, title: true, slug: true, startDate: true, city: true } }
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

  fastify.get('/:ticketId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/:ticketId/download', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { ticketId } = req.params as Record<string, string>;
    const userId = user?.id;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    console.log(`[TICKET_DOWNLOAD] Request for ticketId=${ticketId}`);

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, pdfUrl: true, ticketCode: true, status: true, generatedAt: true, createdAt: true }
    });

    console.log(`[TICKET_DOWNLOAD] Found ticket:`, JSON.stringify({
      id: ticket?.id,
      status: ticket?.status,
      pdfUrl: ticket?.pdfUrl,
      generatedAt: ticket?.generatedAt,
      createdAt: ticket?.createdAt
    }, null, 2));

    if (!ticket) {
      console.log(`[TICKET_DOWNLOAD] Ticket not found: ${ticketId}`);
      return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    }

    if (ticket.userId !== userId) {
      console.log(`[TICKET_DOWNLOAD] Access denied for ticketId=${ticketId}`);
      return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });
    }

    if (!ticket.pdfUrl) {
      console.log(`[TICKET_DOWNLOAD] No PDF URL for ticket ${ticketId}, status: ${ticket.status}, generatedAt: ${ticket.generatedAt}`);
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

    console.log(`[TICKET_DOWNLOAD] Redirecting PDF for ticketId=${ticketId}`);

    return reply.redirect(302, downloadUrl);
  });

  fastify.post('/:ticketId/resend', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/:ticketId/regenerate-pdf', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { ticketId } = req.params as Record<string, string>;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, status: true, orderId: true }
    });

    if (!ticket) {
      return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    }
    if (ticket.userId !== user.id) {
      return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });
    }
    if (ticket.status !== 'ACTIVE') {
      return reply.code(400).send({ error: 'TICKET_NOT_ACTIVE', message: 'Tiket tidak aktif' });
    }

    const { createQueue, Queues } = await import('../../services/redis.js');
    const queue = createQueue(Queues.TICKET_GENERATE);
    await queue.add('generate', { orderId: ticket.orderId });

    return { message: 'PDF regeneration enqueued' };
  });

  const TransferInitiateSchema = z.object({
    recipientEmail: z.string().email(),
    message: z.string().max(200).optional(),
  });

  fastify.post('/:ticketId/transfer/initiate', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string; name: string; email?: string };
    const { ticketId } = req.params as Record<string, string>;
    const { recipientEmail, message } = TransferInitiateSchema.parse(req.body);
    const normalizedRecipientEmail = recipientEmail.trim().toLowerCase();
    const normalizedSenderEmail = (user.email || '').trim().toLowerCase();

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { 
        order: { include: { event: true } }, 
        user: true,
        transfers: { where: { status: 'PENDING' } }
      }
    });

    if (!ticket) return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    if (ticket.userId !== user.id) return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });
    if (ticket.status !== 'ACTIVE') return reply.code(400).send({ error: 'TICKET_NOT_ACTIVE', message: 'Tiket tidak aktif' });
    if (ticket.transfers.length > 0) return reply.code(400).send({ error: 'TRANSFER_ALREADY_PENDING', message: 'Tiket ini sedang dalam proses transfer' });
    if (normalizedSenderEmail && normalizedRecipientEmail === normalizedSenderEmail) {
      return reply.code(400).send({ error: 'CANNOT_TRANSFER_TO_SELF', message: 'Tidak bisa mengirim ke diri sendiri' });
    }

    const recipient = await prisma.user.findUnique({ where: { email: normalizedRecipientEmail } });

    // Create transfer record
    const transfer = await prisma.ticketTransfer.create({
      data: {
        ticketId,
        fromUserId: user.id,
        toUserId: recipient?.id,
        toEmail: normalizedRecipientEmail,
        message,
        initiatedAt: new Date(),
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    });

    // Notify
    await sendTransferInvitationEmail({
      to: normalizedRecipientEmail,
      senderName: user.name || ticket.user.name || 'Seseorang',
      eventName: ticket.order.event.title,
      ticketCode: ticket.ticketCode,
      message,
      transferId: transfer.id
    });

    if (recipient?.id) {
      await prisma.notification.create({
        data: {
          userId: recipient.id,
          type: 'TICKET_TRANSFER_RECEIVED',
          title: 'Tiket Baru Diterima',
          body: `${user.name || 'Seseorang'} mengirimkan tiket untuk event ${ticket.order.event.title} kepada Anda.`,
          data: { transferId: transfer.id, ticketId }
        }
      }).catch(() => {});
    }

    return { message: 'Transfer initiated successfully', transferId: transfer.id };
  });

  fastify.post('/:ticketId/transfer/resend', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string; name?: string };
    const { ticketId } = req.params as Record<string, string>;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: true,
        order: { include: { event: true } },
        transfers: {
          where: { status: 'PENDING' },
          orderBy: { initiatedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!ticket) return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    if (ticket.userId !== user.id) return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });
    if (!ticket.transfers.length) {
      return reply.code(404).send({ error: 'NO_PENDING_TRANSFER', message: 'Tidak ada transfer pending untuk tiket ini' });
    }

    const pendingTransfer = ticket.transfers[0];

    if (new Date() > pendingTransfer.expiredAt) {
      await prisma.ticketTransfer.update({
        where: { id: pendingTransfer.id },
        data: { status: 'EXPIRED' }
      });
      return reply.code(400).send({ error: 'TRANSFER_EXPIRED', message: 'Transfer sudah kedaluwarsa, silakan buat transfer baru' });
    }

    await sendTransferInvitationEmail({
      to: pendingTransfer.toEmail,
      senderName: user.name || ticket.user?.name || 'Seseorang',
      eventName: ticket.order.event.title,
      ticketCode: ticket.ticketCode,
      transferId: pendingTransfer.id,
      message: pendingTransfer.message
    });

    return { message: 'Transfer invitation resent successfully', transferId: pendingTransfer.id };
  });

  fastify.get('/:ticketId/transfers/pending', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { ticketId } = req.params as Record<string, string>;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true }
    });

    if (!ticket) return reply.code(404).send({ error: 'TICKET_NOT_FOUND', message: 'Tiket tidak ditemukan' });
    if (ticket.userId !== user.id) return reply.code(403).send({ error: 'NOT_TICKET_OWNER', message: 'Anda bukan pemilik tiket ini' });

    const transfers = await prisma.ticketTransfer.findMany({
      where: { ticketId, status: 'PENDING' },
      orderBy: { initiatedAt: 'desc' },
      select: {
        id: true,
        toEmail: true,
        status: true,
        initiatedAt: true,
        expiredAt: true,
        message: true
      }
    });

    return { transfers };
  });

  fastify.get('/transfers/:transferId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string; email: string } | undefined;
    if (!user?.id || !user?.email) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Silakan login terlebih dahulu' });
    }

    const { transferId } = req.params as Record<string, string>;

    try {
      const transfer = await prisma.ticketTransfer.findUnique({
        where: { id: transferId },
        include: {
          ticket: {
            include: {
              category: true,
              order: { include: { event: { include: { venues: true } } } }
            }
          }
        }
      });

      if (!transfer) return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND', message: 'Permintaan transfer tidak ditemukan' });
      
      // Security: Only sender or recipient can see details
      if (transfer.fromUserId !== user.id && transfer.toEmail !== user.email && transfer.toUserId !== user.id) {
        return reply.code(403).send({ error: 'ACCESS_DENIED', message: 'Anda tidak memiliki akses ke transfer ini' });
      }

      const sender = await prisma.user.findUnique({
        where: { id: transfer.fromUserId },
        select: { name: true, email: true }
      });

      return {
        ...transfer,
        fromUser: sender || null
      };
    } catch (error) {
      req.log.error({ error, transferId, userId: user.id }, 'Failed to load transfer detail');
      return reply.code(500).send({ error: 'TRANSFER_DETAIL_FAILED', message: 'Gagal memuat detail transfer' });
    }
  });

  fastify.post('/transfers/:transferId/accept', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string; email: string; name?: string };
    const { transferId } = req.params as Record<string, string>;

    const transfer = await prisma.ticketTransfer.findUnique({
      where: { id: transferId },
      include: { ticket: true }
    });

    if (!transfer) return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND' });
    if (transfer.status !== 'PENDING') return reply.code(400).send({ error: 'TRANSFER_NOT_PENDING', message: 'Transfer ini sudah diproses atau kedaluwarsa' });
    if (transfer.toEmail !== user.email && transfer.toUserId !== user.id) {
      return reply.code(403).send({ error: 'NOT_RECIPIENT', message: 'Anda bukan penerima tiket ini' });
    }
    if (new Date() > transfer.expiredAt) {
      await prisma.ticketTransfer.update({ where: { id: transferId }, data: { status: 'EXPIRED' } });
      return reply.code(400).send({ error: 'TRANSFER_EXPIRED', message: 'Waktu transfer telah habis (24 jam)' });
    }

    // Execute transfer
    await prisma.$transaction(async (tx) => {
      // 1. Update ticket ownership and holder info
      await tx.ticket.update({
        where: { id: transfer.ticketId },
        data: {
          userId: user.id,
          holderName: user.name || user.email.split('@')[0],
          transferCount: { increment: 1 },
          // PDF needs to be regenerated with new name
          pdfUrl: null, 
          qrImageUrl: null
        }
      });

      // 2. Update transfer status
      await tx.ticketTransfer.update({
        where: { id: transferId },
        data: { status: 'ACCEPTED', respondedAt: new Date(), toUserId: user.id }
      });

      // 3. Notify sender
      await tx.notification.create({
        data: {
          userId: transfer.fromUserId,
          type: 'TICKET_TRANSFER_ACCEPTED',
          title: 'Transfer Tiket Diterima',
          body: `Transfer tiket Anda telah diterima oleh ${user.name || user.email}.`,
          data: { transferId, ticketId: transfer.ticketId }
        }
      });

      // 4. Notify recipient (who accepted)
      await tx.notification.create({
        data: {
          userId: user.id,
          type: 'TICKET_TRANSFER_ACCEPTED_SELF',
          title: 'Tiket Berhasil Diterima',
          body: 'Tiket transfer berhasil masuk ke akun Anda.',
          data: { transferId, ticketId: transfer.ticketId }
        }
      });

      // 5. Trigger PDF regeneration for the new owner
      const { createQueue, Queues } = await import('../../services/redis.js');
      const queue = createQueue(Queues.TICKET_GENERATE);
      // Wait, TICKET_GENERATE usually takes orderId. But we only changed one ticket.
      // We might need a separate job for single ticket generation or just use orderId.
      // For now, let's just trigger order-wide regeneration (it will skip ACTIVE tickets that have PDFs, 
      // but wait, we NEED to change the name on the PDF!)
      await queue.add('generate', { orderId: transfer.ticket.orderId });
    });

    return { message: 'Ticket transferred successfully' };
  });
}
