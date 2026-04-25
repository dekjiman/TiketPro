import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { encryptQrPayload, generateQrImage, signPayload } from '../../lib/qr.js';
import { generateDefaultPdf } from '../../lib/pdf-default.js';
import { env } from '../../config/env.js';
import { redis } from '../../services/redis.js';

const prisma = new PrismaClient();

const MAX_TRANSFER_COUNT = 3;
const TRANSFER_EXPIRE_HOURS = 24;

const InitiateTransferSchema = z.object({
  recipientEmail: z.string().email(),
  message: z.string().optional()
});

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  throw new Error('R2 upload not implemented');
}

async function sendNotificationEmail(to: string, subject: string, html: string) {
  console.log(`[EMAIL_NOTIF] to=${to}, subject=${subject}`);
}

async function sendNotificationWa(phone: string, message: string) {
  console.log(`[WA_NOTIF] to=${phone}, message=${message}`);
}

export async function transferTicketRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { ticketId: string }; Body: { recipientEmail: string; message?: string } }>(
    '/:ticketId/transfer/initiate',
    async (req, reply) => {
      const user = (req as any).user as { id: string; email: string; name: string } | undefined;
      const userId = user?.id;
      const { ticketId } = req.params;
      const body = InitiateTransferSchema.parse(req.body);

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { order: { include: { event: true } } }
      });

      if (!ticket) {
        return reply.code(404).send({ error: 'TICKET_NOT_FOUND' });
      }

      if (ticket.userId !== userId) {
        return reply.code(403).send({ error: 'NOT_TICKET_OWNER' });
      }

      if (ticket.status !== 'ACTIVE') {
        return reply.code(400).send({ error: 'TICKET_NOT_ACTIVE' });
      }

      if (new Date() >= ticket.order.event.startDate) {
        return reply.code(400).send({ error: 'EVENT_STARTED' });
      }

      if ((ticket.transferCount || 0) >= MAX_TRANSFER_COUNT) {
        return reply.code(400).send({ error: 'MAX_TRANSFER_REACHED' });
      }

      const recipient = await prisma.user.findFirst({
        where: { emailNormalized: body.recipientEmail.toLowerCase() }
      });

      if (!recipient || !recipient.isVerified) {
        return reply.code(400).send({ error: 'RECIPIENT_NOT_FOUND' });
      }

      if (recipient.id === userId) {
        return reply.code(400).send({ error: 'CANNOT_TRANSFER_TO_SELF' });
      }

      const existingPending = await prisma.ticketTransfer.findFirst({
        where: { ticketId, status: 'PENDING' }
      });

      if (existingPending) {
        return reply.code(400).send({ error: 'TRANSFER_PENDING_EXISTS' });
      }

      const expiredAt = new Date(Date.now() + TRANSFER_EXPIRE_HOURS * 60 * 60 * 1000);

      const transfer = await prisma.ticketTransfer.create({
        data: {
          ticketId,
          fromUserId: userId,
          toEmail: recipient.email,
          message: body.message,
          status: 'PENDING',
          initiatedAt: new Date(),
          expiredAt
        }
      });

      await sendNotificationEmail(
        recipient.email,
        'Tiket Undangan Transfer',
        `<p>Halo! ${user.name} ingin mentransfer tiket kepadamu.</p>
         <p>Tiket: ${ticket.ticketCode}</p>
         <p>Klik accepting link di aplikasi.</p>`
      );

      return reply.code(201).send({
        transferId: transfer.id,
        recipientName: recipient.name,
        expiredAt: transfer.expiredAt.toISOString()
      });
    }
  );

  fastify.post<{ Params: { transferId: string } }>(
    '/transfer/:transferId/accept',
    async (req, reply) => {
      const user = (req as any).user as { id: string; email: string; name: string } | undefined;
      const userId = user?.id;
      const { transferId } = req.params;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const transfer = await prisma.ticketTransfer.findUnique({
        where: { id: transferId },
        include: {
          ticket: { include: { category: true, order: { include: { event: true } } } }
        }
      });

      if (!transfer) {
        return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND' });
      }

      if (transfer.toEmail.toLowerCase() !== (user as any).email?.toLowerCase()) {
        return reply.code(403).send({ error: 'NOT_RECIPIENT' });
      }

      if (transfer.status !== 'PENDING') {
        return reply.code(400).send({ error: 'TRANSFER_NOT_PENDING' });
      }

      if (new Date() >= transfer.expiredAt) {
        return reply.code(400).send({ error: 'TRANSFER_EXPIRED' });
      }

      const transferData = transfer as any;
      if (new Date() >= transferData.expiredAt) {
        return reply.code(400).send({ error: 'TRANSFER_EXPIRED' });
      }

      const { ticket } = transferData;
      const category = ticket.category as any;
      const order = ticket.order as any;
      const event = order.event as any;

      const rawPayload = {
        tid: ticket.id,
        eid: ticket.orderId,
        cid: ticket.categoryId,
        uid: userId,
        hn: user.name,
        iat: Math.floor(Date.now() / 1000),
        sig: ''
      };
      rawPayload.sig = signPayload(rawPayload);
      const qrEncrypted = encryptQrPayload(rawPayload);
      const qrBuffer = await generateQrImage(qrEncrypted);
      const qrImageUrl = await uploadToR2(`qr/${ticket.id}_new.png`, qrBuffer, 'image/png');

      const pdfBuffer = await generateDefaultPdf(
        {
          id: ticket.id,
          ticketCode: ticket.ticketCode,
          holderName: user.name,
          isInternal: ticket.isInternal,
          category: { name: category.name, colorHex: category.colorHex || undefined },
          orderId: order.id,
          order: {
            id: order.id,
            event: {
              title: event.title,
              startDate: event.startDate,
              endDate: event.endDate,
              city: event.city
            },
            eo: { companyName: 'EO' }
          }
        },
        {
          id: order.id,
          event: {
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            city: event.city
          },
          eo: { companyName: 'EO' }
        },
        qrBuffer
      );
      const pdfUrl = await uploadToR2(`tickets/${ticket.id}_new.pdf`, pdfBuffer, 'application/pdf');

      const updatedTicket = await prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            userId,
            holderName: user.name,
            qrImageUrl,
            pdfUrl,
            transferCount: { increment: 1 }
          }
        });

        await tx.ticketTransfer.update({
          where: { id: transferId },
          data: { status: 'ACCEPTED', respondedAt: new Date() }
        });

        return tx.ticket.findUnique({ where: { id: ticket.id } });
      });

      if (user.email) {
        await sendNotificationEmail(user.email, 'Tiket Diterima', `<p>Tiket berhasil ditransfer ke akunmu.</p>`);
      }
      if ((user as any).phone) {
        await sendNotificationWa((user as any).phone, `Tiket ${updatedTicket?.ticketCode} berhasil ditransfer ke akunmu!`);
      }

      const sender = await prisma.user.findUnique({ where: { id: transfer.fromUserId } });
      if (sender?.email) {
        await sendNotificationEmail(sender.email, 'Tiket Ditransfer', `<p>Tiket berhasil ditransfer ke ${user.email}.</p>`);
      }

      return reply.send({
        ticket: {
          id: updatedTicket!.id,
          ticketCode: updatedTicket!.ticketCode,
          qrImageUrl: updatedTicket!.qrImageUrl,
          pdfUrl: updatedTicket!.pdfUrl
        }
      });
    }
  );

  fastify.post<{ Params: { transferId: string } }>(
    '/transfer/:transferId/decline',
    async (req, reply) => {
      const user = (req as any).user as { id: string; email: string } | undefined;
      const { transferId } = req.params;

      if (!(user as any)?.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const transfer = await prisma.ticketTransfer.findUnique({
        where: { id: transferId }
      });

      if (!transfer) {
        return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND' });
      }

      if (transfer.toEmail.toLowerCase() !== (user as any).email?.toLowerCase()) {
        return reply.code(403).send({ error: 'NOT_RECIPIENT' });
      }

      if (transfer.status !== 'PENDING') {
        return reply.code(400).send({ error: 'TRANSFER_NOT_PENDING' });
      }

      await prisma.ticketTransfer.update({
        where: { id: transferId },
        data: { status: 'DECLINED', respondedAt: new Date() }
      });

      const sender = await prisma.user.findUnique({ where: { id: transfer.fromUserId } });
      if (sender?.email) {
        await sendNotificationEmail(sender.email, 'Tiket Ditolak', `<p>Penerima menolak transfer tiket.</p>`);
      }

      return reply.code(200).send({ message: 'Transfer declined' });
    }
  );

  fastify.delete<{ Params: { transferId: string } }>(
    '/transfer/:transferId',
    async (req, reply) => {
      const user = (req as any).user as { id: string } | undefined;
      const { transferId } = req.params;

      if (!user?.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const transfer = await prisma.ticketTransfer.findUnique({
        where: { id: transferId }
      });

      if (!transfer) {
        return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND' });
      }

      if (transfer.fromUserId !== user.id) {
        return reply.code(403).send({ error: 'NOT_SENDER' });
      }

      if (transfer.status !== 'PENDING') {
        return reply.code(400).send({ error: 'TRANSFER_NOT_PENDING' });
      }

      await prisma.ticketTransfer.update({
        where: { id: transferId },
        data: { status: 'EXPIRED' }
      });

      return reply.code(200).send({ message: 'Transfer cancelled' });
    }
  );
}