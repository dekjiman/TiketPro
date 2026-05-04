import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { authenticate } from './auth.js';
import { env } from '../config/env.js';
import { encryptQrPayload, generateQrImage, signPayload } from '../lib/qr.js';
import { generateDefaultPdf } from '../lib/pdf-default.js';
import { generateTicketCode } from '../lib/ticket-code.js';
import { sendEmail } from '../services/email.js';

const prisma = new PrismaClient();
const MANUAL_TICKET_SOURCE = 'MANUAL' as const;
const ACTIVE_TICKET_STATUS = 'ACTIVE' as const;
const FULFILLED_ORDER_STATUS = 'FULFILLED' as const;
const MANUAL_PAYMENT_METHOD = 'MANUAL' as const;

const BUCKET = env.CLOUDFLARE_R2_BUCKET || 'tickets';

let s3: S3Client | null = null;
if (env.CLOUDFLARE_R2_ACCESS_KEY && env.CLOUDFLARE_R2_SECRET_KEY && env.CLOUDFLARE_R2_ACCOUNT_ID) {
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY,
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_KEY,
    },
  });
}

const AttendeeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.preprocess(
    value => (value === '' ? undefined : value),
    z.string().trim().email().optional()
  ),
  phone: z.preprocess(
    value => (value === '' ? undefined : value),
    z.string().trim().min(6).optional()
  ),
});

const GenerateTicketsSchema = z.object({
  categoryId: z.string().cuid(),
  quantity: z.coerce.number().int().positive().max(500).optional(),
  attendees: z.array(AttendeeSchema).optional(),
});

const SendTicketSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'both']).default('both'),
});

type AuthUser = {
  id: string;
  role: string;
  email?: string;
};

type InternalTicketTicket = {
  id: string;
  ticketCode: string;
  holderName: string;
  holderEmail: string | null;
  holderPhone: string | null;
  category: { id: string; name: string; colorHex: string | null };
  status: string;
  qrEncrypted: string | null;
  qrImageUrl: string | null;
  pdfUrl: string | null;
  generatedAt: Date | null;
  createdAt: Date;
};

type PreparedInternalTicket = {
  id: string;
  ticketCode: string;
  holderName: string;
  holderEmail: string | null;
  holderPhone: string | null;
  qrEncrypted: string;
  qrImageUrl: string;
  pdfUrl: string;
};

type EventAccess = {
  id: string;
  slug: string;
  title: string;
  city: string;
  startDate: Date;
  endDate: Date;
  eoId: string;
  eo: { companyName: string | null; user: { name: string } };
  venues: Array<{ name: string; address: string }>;
};

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (!s3) {
    const cwd = process.cwd();
    const baseDir = cwd.includes(`${path.sep}apps${path.sep}api`)
      ? path.join(cwd, 'public')
      : path.join(cwd, 'apps', 'api', 'public');
    const filePath = path.join(baseDir, key);

    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);
    return `${env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/public/${key}`;
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  const baseUrl = env.CLOUDFLARE_R2_PUBLIC_URL
    || (env.CLOUDFLARE_R2_ACCOUNT_ID ? `https://${BUCKET}.${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

  return `${baseUrl}/${key}`;
}

async function getAccessibleEvent(eventId: string, user: AuthUser): Promise<EventAccess | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      eo: { include: { user: { select: { name: true } } } },
      venues: { select: { name: true, address: true } },
    },
  });

  if (!event) {
    return null;
  }

  if (user.role === 'SUPER_ADMIN') {
    return event as EventAccess;
  }

  if (user.role !== 'EO_ADMIN') {
    return null;
  }

  const eoProfile = await prisma.eoProfile.findUnique({ where: { userId: user.id } });
  if (!eoProfile || eoProfile.id !== event.eoId) {
    return null;
  }

  return event as EventAccess;
}

function buildAttendees(quantity: number, attendees?: z.infer<typeof AttendeeSchema>[]) {
  if (!attendees || attendees.length === 0) {
    return Array.from({ length: quantity }, (_, index) => ({
      name: `Internal Guest ${index + 1}`,
      email: undefined as string | undefined,
      phone: undefined as string | undefined,
    }));
  }

  return attendees;
}

function buildInternalTicketCreateData(
  ticket: PreparedInternalTicket,
  categoryId: string,
  userId: string,
  orderId: string,
  generatedAt: Date
) {
  return {
    id: ticket.id,
    orderId,
    categoryId,
    userId,
    ticketCode: ticket.ticketCode,
    source: MANUAL_TICKET_SOURCE,
    status: ACTIVE_TICKET_STATUS,
    holderName: ticket.holderName,
    holderEmail: ticket.holderEmail,
    holderPhone: ticket.holderPhone,
    isInternal: true,
    qrEncrypted: ticket.qrEncrypted,
    qrImageUrl: ticket.qrImageUrl,
    pdfUrl: ticket.pdfUrl,
    generatedAt,
  } as any;
}

function buildTicketQrPayload(ticketId: string, eventId: string, categoryId: string, userId: string, holderName: string) {
  return {
    tid: ticketId,
    eid: eventId,
    cid: categoryId,
    uid: userId,
    hn: holderName,
    iat: Math.floor(Date.now() / 1000),
    sig: '',
  };
}

function addCacheBuster(url: string, version: string | number): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(version))}`;
}

async function createTicketArtifacts({
  ticketId,
  ticketCode,
  event,
  category,
  order,
  holderName,
  holderEmail,
}: {
  ticketId: string;
  ticketCode: string;
  event: EventAccess;
  category: { id: string; name: string; colorHex: string | null; templateType: string; templateUrl: string | null };
  order: {
    id: string;
    eventId: string;
    userId: string;
  };
  holderName: string;
  holderEmail?: string;
}) {
  const rawPayload = buildTicketQrPayload(ticketId, event.id, category.id, order.userId, holderName);
  rawPayload.sig = signPayload(rawPayload);
  const qrEncrypted = encryptQrPayload(rawPayload);
  const qrBuffer = await generateQrImage(qrEncrypted);
  const qrImageUrl = await uploadToR2(`qr/internal/${ticketCode}.png`, qrBuffer, 'image/png');

  const venue = event.venues?.[0];
  const ticketForPdf = {
    id: ticketId,
    ticketCode,
    holderName,
    holderEmail: holderEmail || undefined,
    isInternal: true,
    category: { name: category.name, colorHex: category.colorHex || undefined },
    orderId: order.id,
    order: {
      id: order.id,
      event: {
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        city: event.city,
        venue: venue ? { name: venue.name, address: venue.address } : undefined,
      },
      eo: { companyName: event.eo?.companyName || 'EO' },
    },
  };

  const pdfBuffer = await generateDefaultPdf(
    ticketForPdf as any,
    ticketForPdf.order as any,
    qrBuffer
  );
  const pdfUrl = await uploadToR2(`tickets/internal/${ticketCode}.pdf`, pdfBuffer, 'application/pdf');

  return {
    qrEncrypted,
    qrImageUrl,
    pdfUrl: addCacheBuster(pdfUrl, ticketId),
  };
}

async function sendWhatsApp(ticket: InternalTicketTicket): Promise<boolean> {
  const phone = ticket.holderPhone;
  if (!phone) {
    return false;
  }

  console.log(`[EO_INTERNAL_WA] to=${phone} ticket=${ticket.ticketCode}`);
  return true;
}

export async function eoTicketRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/events/:eventId/tickets/generate', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (user.role !== 'EO_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const eventId = (req.params as { eventId: string }).eventId;
    const parsed = GenerateTicketsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }

    const event = await getAccessibleEvent(eventId, user);
    if (!event) {
      return reply.code(404).send({ error: 'EVENT_NOT_FOUND', message: 'Event tidak ditemukan atau tidak dapat diakses' });
    }

    const payload = parsed.data;
    const category = await prisma.ticketCategory.findFirst({
      where: {
        id: payload.categoryId,
        eventId: event.id,
      },
    });

    if (!category) {
      return reply.code(404).send({ error: 'CATEGORY_NOT_FOUND', message: 'Kategori tiket tidak ditemukan' });
    }

    if (!category.isInternal) {
      return reply.code(400).send({
        error: 'CATEGORY_NOT_INTERNAL',
        message: 'Hanya kategori internal yang dapat digenerate manual',
      });
    }

    const quantity = payload.quantity ?? payload.attendees?.length ?? 0;
    if (!quantity || quantity <= 0) {
      return reply.code(400).send({
        error: 'QUANTITY_REQUIRED',
        message: 'Quantity wajib diisi jika attendee tidak dikirim',
      });
    }

    if (payload.attendees && payload.attendees.length > 0 && payload.attendees.length !== quantity) {
      return reply.code(400).send({
        error: 'QUANTITY_MISMATCH',
        message: 'Quantity harus sama dengan jumlah attendee',
      });
    }

    const attendees = buildAttendees(quantity, payload.attendees);
    const orderId = crypto.randomUUID();
    const orderCreatedAt = new Date();
    const preparedTickets: PreparedInternalTicket[] = [];

    for (let index = 0; index < quantity; index += 1) {
      const attendee = attendees[index];
      const ticketId = crypto.randomUUID();
      const ticketCode = generateTicketCode(`${event.slug}-${index + 1}`);
      const artifacts = await createTicketArtifacts({
        ticketId,
        ticketCode,
        event,
        category: {
          id: category.id,
          name: category.name,
          colorHex: category.colorHex || null,
          templateType: category.templateType,
          templateUrl: category.templateUrl,
        },
        order: {
          id: orderId,
          eventId: event.id,
          userId: user.id,
        },
        holderName: attendee.name,
        holderEmail: attendee.email,
      });

      preparedTickets.push({
        id: ticketId,
        ticketCode,
        holderName: attendee.name,
        holderEmail: attendee.email || null,
        holderPhone: attendee.phone || null,
        qrEncrypted: artifacts.qrEncrypted,
        qrImageUrl: artifacts.qrImageUrl,
        pdfUrl: artifacts.pdfUrl,
      });
    }

    let createdTickets: Array<PreparedInternalTicket & { status: typeof ACTIVE_TICKET_STATUS; source: typeof MANUAL_TICKET_SOURCE }> = [];
    try {
      createdTickets = await prisma.$transaction(async (tx) => {
      const freshCategory = await tx.ticketCategory.findUnique({
        where: { id: category.id },
      });

      if (!freshCategory) {
        throw new Error('CATEGORY_NOT_FOUND');
      }

      if (!freshCategory.isInternal) {
        throw new Error('CATEGORY_NOT_INTERNAL');
      }

      const quotaGuard = await tx.ticketCategory.updateMany({
        where: {
          id: category.id,
          eventId: event.id,
          isInternal: true,
          sold: { lte: freshCategory.quota - quantity },
        },
        data: { sold: { increment: quantity } },
      });

      if (!quotaGuard || quotaGuard.count !== 1) {
        throw new Error('QUOTA_EXCEEDED');
      }

      await tx.order.create({
        data: {
          id: orderId,
          userId: user.id,
          eventId: event.id,
          idempotencyKey: `manual_${orderId}`,
          status: FULFILLED_ORDER_STATUS,
          totalAmount: 0,
          discountAmount: 0,
          finalAmount: 0,
          paymentMethod: MANUAL_PAYMENT_METHOD,
          paidAt: orderCreatedAt,
          fulfilledAt: orderCreatedAt,
          expiredAt: new Date(orderCreatedAt.getTime() + 365 * 24 * 60 * 60 * 1000),
          items: {
            create: {
              categoryId: category.id,
              quantity,
              unitPrice: 0,
              subtotal: 0,
            },
          },
        },
      });

      for (const ticket of preparedTickets) {
        await tx.ticket.create({
          data: buildInternalTicketCreateData(ticket, category.id, user.id, orderId, orderCreatedAt),
        });
      }

        return preparedTickets.map(ticket => ({
          ...ticket,
          status: ACTIVE_TICKET_STATUS,
          source: MANUAL_TICKET_SOURCE,
        }));
      });
    } catch (error: any) {
      if (error?.message === 'QUOTA_EXCEEDED') {
        return reply.code(400).send({
          error: 'QUOTA_EXCEEDED',
          message: 'Kuota terlampaui untuk kategori internal',
        });
      }
      if (error?.message === 'CATEGORY_NOT_FOUND' || error?.message === 'CATEGORY_NOT_INTERNAL') {
        return reply.code(400).send({
          error: error.message,
          message: 'Kategori tiket internal tidak valid',
        });
      }
      throw error;
    }

    return reply.code(201).send({
      success: true,
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
      },
      category: {
        id: category.id,
        name: category.name,
      },
      tickets: createdTickets.map((ticket) => ({
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        holderName: ticket.holderName,
        holderEmail: ticket.holderEmail,
        holderPhone: ticket.holderPhone,
        status: ticket.status,
        source: MANUAL_TICKET_SOURCE,
        qrEncrypted: null,
        qrImageUrl: ticket.qrImageUrl,
        pdfUrl: ticket.pdfUrl,
      })),
    });
  });

  fastify.get('/events/:eventId/tickets/internal', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (user.role !== 'EO_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const eventId = (req.params as { eventId: string }).eventId;
    const event = await getAccessibleEvent(eventId, user);
    if (!event) {
      return reply.code(404).send({ error: 'EVENT_NOT_FOUND' });
    }

    const page = Math.max(1, parseInt(String((req.query as any).page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String((req.query as any).limit || '20'), 10)));
    const skip = (page - 1) * limit;
    const categoryId = (req.query as any).categoryId as string | undefined;

    const where: any = {
      order: { eventId: event.id },
      category: { isInternal: true },
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, colorHex: true } },
          order: { select: { id: true, eventId: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return {
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        holderName: ticket.holderName,
        holderEmail: ticket.holderEmail,
        holderPhone: ticket.holderPhone,
        category: ticket.category,
        status: ticket.status,
        source: MANUAL_TICKET_SOURCE,
        qrEncrypted: null,
        qrImageUrl: ticket.qrImageUrl,
        pdfUrl: ticket.pdfUrl,
        generatedAt: ticket.generatedAt,
        createdAt: ticket.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  });

  fastify.post('/tickets/:ticketId/send', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (user.role !== 'EO_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { ticketId } = req.params as { ticketId: string };
    const body = SendTicketSchema.parse(req.body || {});

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        category: true,
        order: {
          include: {
            event: {
              include: {
                eo: { include: { user: { select: { name: true } } } },
                venues: { select: { name: true, address: true } },
              },
            },
          },
        },
      },
    });

    if (!ticket || !ticket.order) {
      return reply.code(404).send({ error: 'TICKET_NOT_FOUND' });
    }

    const event = await getAccessibleEvent(ticket.order.eventId, user);
    if (!event) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const sent: Record<string, boolean> = {};
    const subject = `Tiket Internal - ${ticket.order.event.title}`;
    const html = `
      <h2>Tiket Internal</h2>
      <p>Event: ${ticket.order.event.title}</p>
      <p>Nama: ${ticket.holderName}</p>
      <p>Kode Tiket: ${ticket.ticketCode}</p>
      <p>PDF: <a href="${ticket.pdfUrl || ''}">${ticket.pdfUrl || 'N/A'}</a></p>
      <p>QR: <a href="${ticket.qrImageUrl || ''}">${ticket.qrImageUrl || 'N/A'}</a></p>
    `;

    if ((body.channel === 'email' || body.channel === 'both') && !ticket.holderEmail) {
      return reply.code(400).send({ error: 'EMAIL_NOT_AVAILABLE', message: 'Tiket ini tidak memiliki email penerima' });
    }

    if ((body.channel === 'whatsapp' || body.channel === 'both') && !ticket.holderPhone) {
      return reply.code(400).send({ error: 'PHONE_NOT_AVAILABLE', message: 'Tiket ini tidak memiliki nomor WhatsApp penerima' });
    }

    if (body.channel === 'email' || body.channel === 'both') {
      await sendEmail({
        to: ticket.holderEmail!,
        subject,
        html,
      });
      sent.email = true;

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { emailSentAt: new Date() },
      });
    }

    if (body.channel === 'whatsapp' || body.channel === 'both') {
      const waSent = await sendWhatsApp(ticket as any);
      sent.whatsapp = waSent;

      if (waSent) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { waSentAt: new Date() },
        });
      }
    }

    return { success: true, sent };
  });

  fastify.delete('/tickets/:ticketId', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (user.role !== 'EO_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { ticketId } = req.params as { ticketId: string };
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { order: true, category: true },
    });

    if (!ticket) {
      return reply.code(404).send({ error: 'TICKET_NOT_FOUND' });
    }

    const event = await getAccessibleEvent(ticket.order.eventId, user);
    if (!event) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (!ticket.isInternal) {
      return reply.code(400).send({ error: 'INVALID_SOURCE', message: 'Hanya tiket manual yang bisa dihapus' });
    }

    if (ticket.status === 'CHECKIN') {
      return reply.code(400).send({ error: 'TICKET_USED', message: 'Tiket yang sudah dipakai tidak dapat dihapus' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: 'CANCELLED' },
      });

      await tx.ticketCategory.update({
        where: { id: ticket.categoryId },
        data: { sold: { decrement: 1 } },
      });
    });

    return { success: true };
  });
}
