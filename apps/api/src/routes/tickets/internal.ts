import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { encryptQrPayload, generateQrImage, signPayload } from '../../lib/qr.js';
import { generateDefaultPdf } from '../../lib/pdf-default.js';
import { env } from '../../config/env.js';

const prisma = new PrismaClient();

const CreateInternalTicketSchema = z.object({
  categoryId: z.string().cuid(),
  holders: z.array(z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    notes: z.string().optional()
  })).min(1).max(50)
});

type CreateInternalTicketBody = z.infer<typeof CreateInternalTicketSchema>;

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  throw new Error('R2 upload not implemented');
}

async function logAudit(event: string, userId: string, data: any) {
  console.log(`[AUDIT] ${event}: userId=${userId}`, data);
}

export async function internalTicketRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: CreateInternalTicketBody }>('/internal', {
    schema: {
      body: {
        type: 'object',
        required: ['categoryId', 'holders'],
        properties: {
          categoryId: { type: 'string' },
          holders: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 100 },
                email: { type: 'string' },
                phone: { type: 'string' },
                role: { type: 'string' },
                notes: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (req: FastifyRequest<{ Body: CreateInternalTicketBody }>, reply: FastifyReply) => {
    const staff = (req as any).user as { id: string; role: string } | undefined;
    const staffId = staff?.id;
    const staffRole = staff?.role;

    if (!staffId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (staffRole !== 'EO_ADMIN' && staffRole !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Hanya EO_ADMIN atau EO_STAFF yang dapat membuat tiket internal' });
    }

    const data = CreateInternalTicketSchema.parse(req.body);
    const category = await prisma.ticketCategory.findUnique({
      where: { id: data.categoryId },
      include: {
        event: {
          include: { eo: true, venues: true }
        }
      }
    });

    if (!category) {
      return reply.code(404).send({ error: 'CATEGORY_NOT_FOUND', message: 'Kategori tidak ditemukan' });
    }

    if (!category.isInternal) {
      return reply.code(400).send({ error: 'INTERNAL_TICKET_WRONG_CATEGORY', message: 'Kategori ini bukan untuk tiket internal' });
    }

    if (category.event.eo?.userId !== staffId) {
      const eoStaff = await prisma.staffInvite.findFirst({
        where: { email: (staff as any).email, eoId: category.event.eoId }
      });
      if (!eoStaff) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Anda bukan member EO ini' });
      }
    }

    const existingCount = await prisma.ticket.count({
      where: { categoryId: data.categoryId, isInternal: true }
    });

    if (existingCount + data.holders.length > category.quota) {
      return reply.code(400).send({
        error: 'QUOTA_EXCEEDED',
        message: `Kuota internal tercapai. Sisa: ${category.quota - existingCount}`
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: staffId,
          eventId: category.eventId,
          idempotencyKey: `internal_${Date.now()}_${Math.random().toString(36).substring(2)}`,
          status: 'PAID',
          totalAmount: 0,
          discountAmount: 0,
          finalAmount: 0,
          paidAt: new Date(),
          expiredAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          items: {
            create: {
              categoryId: data.categoryId,
              quantity: data.holders.length,
              unitPrice: 0,
              subtotal: 0
            }
          }
        }
      });

      return newOrder;
    });

    const createdTickets = [];

    for (const holder of data.holders) {
      const ticketCode = `TP-INT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const rawPayload = {
        tid: '',
        eid: category.eventId,
        cid: category.id,
        uid: staffId,
        hn: holder.name,
        iat: Math.floor(Date.now() / 1000),
        sig: ''
      };
      rawPayload.sig = signPayload(rawPayload);
      const qrEncrypted = encryptQrPayload(rawPayload);
      const qrBuffer = await generateQrImage(qrEncrypted);

      const qrImageUrl = await uploadToR2(`qr/internal/${ticketCode}.png`, qrBuffer, 'image/png');

      const ticketData = {
        id: '',
        ticketCode,
        holderName: holder.name,
        holderEmail: holder.email,
        holderPhone: holder.phone,
        holderRole: holder.role,
        isInternal: true,
        qrImageUrl,
        orderId: order.id,
        categoryId: category.id,
        userId: staffId,
        status: 'PENDING' as const
      };

      const pdfTicket = {
        id: '',
        ticketCode,
        holderName: holder.name,
        holderEmail: holder.email,
        isInternal: true,
        category: { name: category.name, colorHex: category.colorHex || undefined },
        orderId: order.id,
        order: {
          id: order.id,
          event: {
            title: category.event.title,
            startDate: category.event.startDate,
            endDate: category.event.endDate,
            city: category.event.city,
            venue: category.event.venues?.[0] ? {
              name: category.event.venues[0].name,
              address: category.event.venues[0].address
            } : undefined
          },
          eo: { companyName: category.event.eo?.companyName || 'EO' }
        }
      };

      const pdfBuffer = await generateDefaultPdf(
        pdfTicket,
        pdfTicket.order,
        qrBuffer
      );

      const pdfUrl = await uploadToR2(`tickets/internal/${ticketCode}.pdf`, pdfBuffer, 'application/pdf');

      const ticket = await prisma.ticket.create({
        data: {
          ...ticketData,
          qrImageUrl,
          pdfUrl,
          status: 'ACTIVE',
          generatedAt: new Date()
        }
      });

      createdTickets.push({
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        holderName: ticket.holderName,
        holderRole: ticket.holderRole,
        qrImageUrl: ticket.qrImageUrl,
        pdfUrl: ticket.pdfUrl,
        status: ticket.status
      });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'FULFILLED', fulfilledAt: new Date() }
    });

    logAudit('INTERNAL_TICKET_CREATED', staffId, {
      categoryId: data.categoryId,
      count: data.holders.length,
      eventId: category.eventId
    });

    return reply.code(201).send({ tickets: createdTickets });
  });
}