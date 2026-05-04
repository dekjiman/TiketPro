import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from './auth.js';
import crypto from 'crypto';
import { decryptQrPayload, verifyQrSignature, AppError } from '../lib/qr.js';

const prisma = new PrismaClient();

const inviteSchema = z.object({
  email: z.string().email(),
  message: z.string().optional(),
});

const INVITE_EXPIRY_DAYS = 7;
const SCAN_RATE_LIMIT_MS = 750;

const scanValidateSchema = z.object({
  gateId: z.string().min(1),
  qrEncrypted: z.string().min(10),
});

function generateInviteToken(inviteId: string): string {
  const data = `invite:${inviteId}`;
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret').update(data).digest('hex').slice(0, 32);
}

function generateEmailHash(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
}

export async function eoRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

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

  fastify.post('/invite-staff', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { email, message } = inviteSchema.parse(req.body);

    if (user.role !== 'EO_ADMIN') {
      return reply.code(403).send({ error: 'Only EO Admin can invite staff' });
    }

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile) {
      return reply.code(400).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
    }

    const existingUser = await (prisma as any).user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.code(400).send({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    const existingInvite = await (prisma as any).staffInvite.findFirst({
      where: { email: email.toLowerCase(), status: 'PENDING', eoId: eoProfile.id },
    });
    if (existingInvite) {
      return reply.code(400).send({ error: 'Invite already sent to this email', code: 'INVITE_EXISTS' });
    }

    const emailHash = generateEmailHash(email);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invite = await (prisma as any).staffInvite.create({
      data: {
        eoId: eoProfile.id,
        email: email.toLowerCase(),
        emailHash,
        status: 'PENDING',
        invitedBy: user.id,
        expiresAt,
      },
    });
    const token = generateInviteToken(invite.id);

    const inviteUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/register?invite=${token}&eoId=${eoProfile.id}&email=${encodeURIComponent(email)}`;

    try {
      const { sendStaffInviteEmail } = await import('../services/email.js');
      await sendStaffInviteEmail({
        to: email,
        companyName: eoProfile.companyName,
        inviteUrl,
        message,
        expiresInDays: INVITE_EXPIRY_DAYS,
      });
    } catch (emailError) {
      console.error('[EMAIL] Failed to send invite email:', emailError);
    }

    return {
      id: invite.id,
      email,
      expiresAt,
      inviteUrl,
    };
  });

  fastify.get('/invites', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;

    if (user.role !== 'EO_ADMIN') {
      return reply.code(403).send({ error: 'Only EO Admin can view invites' });
    }

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile) {
      return { data: [] };
    }

    const invites = await (prisma as any).staffInvite.findMany({
      where: { eoId: eoProfile.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: invites.map((invite: any) => ({
        id: invite.id,
        email: invite.email,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        isExpired: invite.expiresAt < new Date(),
      })),
    };
  });

  fastify.delete('/invites/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };

    if (user.role !== 'EO_ADMIN') {
      return reply.code(403).send({ error: 'Only EO Admin can revoke invites' });
    }

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile) {
      return reply.code(400).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
    }

    const invite = await (prisma as any).staffInvite.findFirst({
      where: { id, eoId: eoProfile.id },
    });
    if (!invite) {
      return reply.code(404).send({ error: 'Invite not found' });
    }

    await (prisma as any).staffInvite.update({
      where: { id },
      data: { status: 'REVOKED' },
    });

    return { success: true };
  });

  fastify.get('/events', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;

    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const eoId = await resolveEoId(user);
    if (!eoId) {
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }

    const { status, search, page = 1, limit = 20 } = req.query as any;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = { eoId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      (prisma as any).event.findMany({
        where,
        select: {
          id: true, title: true, slug: true, posterUrl: true, bannerUrl: true,
          status: true, startDate: true, endDate: true, city: true, province: true,
          isMultiDay: true, createdAt: true,
          categories: {
            select: {
              id: true,
              isInternal: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      (prisma as any).event.count({ where }),
    ]);

    return {
      data: events,
      meta: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    };
  });

  fastify.post('/invites/:id/resend', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };

    if (user.role !== 'EO_ADMIN') {
      return reply.code(403).send({ error: 'Only EO Admin can resend invites' });
    }

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile) {
      return reply.code(400).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
    }

    const invite = await (prisma as any).staffInvite.findFirst({
      where: { id, eoId: eoProfile.id },
    });
    if (!invite) {
      return reply.code(404).send({ error: 'Invite not found' });
    }

    if (invite.status !== 'PENDING') {
      return reply.code(400).send({ error: 'Invite is not pending', code: 'INVITE_NOT_PENDING' });
    }

    if (invite.expiresAt < new Date()) {
      await (prisma as any).staffInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      return reply.code(400).send({ error: 'Invite has expired', code: 'INVITE_EXPIRED' });
    }

    const token = generateInviteToken(invite.id);
    const inviteUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/register?invite=${token}&eoId=${eoProfile.id}&email=${encodeURIComponent(invite.email)}`;

    try {
      const { sendStaffInviteEmail } = await import('../services/email.js');
      await sendStaffInviteEmail({
        to: invite.email,
        companyName: eoProfile.companyName,
        inviteUrl,
        expiresInDays: INVITE_EXPIRY_DAYS,
      });
    } catch (emailError) {
      console.error('[EMAIL] Failed to resend invite email:', emailError);
      return reply.code(500).send({ error: 'Failed to send email', code: 'EMAIL_SEND_FAILED' });
    }

    return { success: true, inviteUrl };
  });

  fastify.get('/events/:id/gates', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };

    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const eoId = await resolveEoId(user);
    if (!eoId) {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    const event = await (prisma as any).event.findFirst({
      where: { id, eoId },
      select: { id: true, title: true },
    });
    if (!event) {
      return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }

    const gates = await (prisma as any).gate.findMany({
      where: { eventId: event.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, categoryIds: true },
    });

    return { data: gates };
  });

  fastify.post('/scanner/validate', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied', code: 'ACCESS_DENIED' });
    }

    // Basic per-user throttling (defense-in-depth; not a replacement for infra rate limiting).
    const lastKey = `scan:last:${user.id}`;
    try {
      const { redis } = await import('../services/redis.js');
      const now = Date.now();
      const last = await redis.get(lastKey);
      if (last && now - parseInt(last) < SCAN_RATE_LIMIT_MS) {
        return reply.code(429).send({ error: 'Terlalu cepat. Coba lagi sebentar.', code: 'RATE_LIMITED' });
      }
      await redis.setex(lastKey, 10, String(now));
    } catch {
      // If Redis is unavailable, continue without throttling (avoid blocking scanning).
    }

    const parsed = scanValidateSchema.safeParse(req.body);
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
      select: {
        id: true,
        eventId: true,
        categoryIds: true,
        event: { select: { id: true, title: true } },
      },
    });

    if (!gate) {
      return reply.code(404).send({ error: 'Gate not found', code: 'GATE_NOT_FOUND' });
    }

    let qrPayload: any;
    try {
      qrPayload = decryptQrPayload(qrEncrypted);
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'INVALID_QR';
      const status = err instanceof AppError ? err.httpStatus : 400;
      return reply.code(status).send({ valid: false, reason: code, error: 'QR code tidak valid', code });
    }

    if (!verifyQrSignature(qrPayload)) {
      return reply.code(400).send({ valid: false, reason: 'TAMPERED_QR', code: 'TAMPERED_QR', error: 'QR code tidak valid' });
    }

    if (qrPayload.eid !== gate.eventId) {
      return reply.code(400).send({ valid: false, reason: 'WRONG_EVENT', code: 'WRONG_EVENT', error: 'QR bukan untuk event ini' });
    }

    const ticket = await (prisma as any).ticket.findFirst({
      where: { id: qrPayload.tid },
      include: {
        category: { select: { id: true, name: true, colorHex: true } },
        order: { select: { eventId: true } },
      },
    });

    if (!ticket || ticket.order?.eventId !== gate.eventId) {
      return reply.code(404).send({ valid: false, reason: 'TICKET_NOT_FOUND', code: 'TICKET_NOT_FOUND', error: 'Ticket tidak ditemukan' });
    }

    if (ticket.status === 'CHECKIN') {
      return reply.code(400).send({
        valid: false,
        reason: 'ALREADY_USED',
        code: 'ALREADY_USED',
        error: 'Ticket sudah digunakan',
        detail: { usedAt: ticket.usedAt?.toISOString() },
      });
    }

    if (ticket.status === 'REFUNDED') {
      return reply.code(400).send({ valid: false, reason: 'TICKET_REFUNDED', code: 'TICKET_REFUNDED', error: 'Ticket refund' });
    }

    if (ticket.status === 'CANCELLED') {
      return reply.code(400).send({ valid: false, reason: 'TICKET_CANCELLED', code: 'TICKET_CANCELLED', error: 'Ticket dibatalkan' });
    }

    if (ticket.status !== 'ACTIVE') {
      return reply.code(400).send({ valid: false, reason: 'TICKET_INACTIVE', code: 'TICKET_INACTIVE', error: 'Ticket tidak aktif' });
    }

    if (!gate.categoryIds.includes(ticket.categoryId)) {
      return reply.code(400).send({
        valid: false,
        reason: 'WRONG_GATE',
        code: 'WRONG_GATE',
        error: 'Gate tidak sesuai kategori ticket',
      });
    }

    // Atomic consume to avoid double-scan race.
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

    return reply.send({
      valid: true,
      ticket: {
        holderName: ticket.holderName,
        categoryName: ticket.category?.name || '',
        categoryColor: ticket.category?.colorHex || undefined,
        isInternal: !!ticket.isInternal,
        ticketCode: ticket.ticketCode,
        eventTitle: gate.event?.title || '',
        usedAt: usedAt.toISOString(),
      },
    });
  });

  fastify.get('/dashboard/overview', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const eoId = await resolveEoId(user);
    if (!eoId) {
      return {
        totalEvents: 0,
        totalSold: 0,
        totalRevenue: 0,
        totalPaidOrders: 0,
        totalCheckIn: 0,
      };
    }

    const [totalEvents, itemsAgg, totalPaidOrders, totalCheckIn] = await Promise.all([
      (prisma as any).event.count({ where: { eoId } }),
      (prisma as any).orderItem.aggregate({
        where: {
          order: {
            event: { eoId },
            status: { in: ['PAID', 'FULFILLED'] },
          },
        },
        _sum: {
          quantity: true,
          subtotal: true,
        },
      }),
      (prisma as any).order.count({
        where: {
          event: { eoId },
          status: { in: ['PAID', 'FULFILLED'] },
        },
      }),
      (prisma as any).ticket.count({
        where: {
          Event: { eoId },
          usedAt: { not: null },
        },
      }),
    ]);

    return {
      totalEvents,
      totalSold: Number(itemsAgg?._sum?.quantity || 0),
      totalRevenue: Number(itemsAgg?._sum?.subtotal || 0),
      totalPaidOrders,
      totalCheckIn,
    };
  });

  fastify.get('/events/:id/dashboard/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };

    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile) {
      return {
        totalSold: 0, totalQuota: 0, quotaFillPercent: 0, totalRevenue: 0, netRevenue: 0, platformFeePercent: 5, categorySummary: [],
      };
    }

    const event = await (prisma as any).event.findFirst({
      where: { id, eoId: eoProfile.id },
    });
    if (!event) {
      return {
        totalSold: 0, totalQuota: 0, quotaFillPercent: 0, totalRevenue: 0, netRevenue: 0, platformFeePercent: 5, categorySummary: [],
      };
    }

    const categories = await (prisma as any).ticketCategory.findMany({
      where: { eventId: id, isInternal: false },
      select: { id: true, name: true, quota: true, sold: true, price: true, status: true },
    });

    const totalQuota = categories.reduce((sum: number, c: any) => sum + c.quota, 0);
    const totalSold = categories.reduce((sum: number, c: any) => sum + c.sold, 0);
    const totalRevenue = categories.reduce((sum: number, c: any) => sum + (c.sold * c.price), 0);
    const platformFee = eoProfile.commission || 0.05;
    const netRevenue = Math.round(totalRevenue * (1 - platformFee));

    return {
      totalSold,
      totalQuota,
      quotaFillPercent: totalQuota > 0 ? Math.round((totalSold / totalQuota) * 100) : 0,
      totalRevenue,
      netRevenue,
      platformFeePercent: Math.round(platformFee * 100),
      categorySummary: categories.map((c: any) => ({
        categoryId: c.id,
        name: c.name,
        quota: c.quota,
        sold: c.sold,
        available: c.quota - c.sold,
        revenue: c.sold * c.price,
      })),
    };
  });

  fastify.get('/events/:id/dashboard/recent-orders', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const query = req.query as any;
    const limit = parseInt(query?.limit as string) || 20;

    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile) {
      return { orders: [] };
    }

    const event = await (prisma as any).event.findFirst({
      where: { id, eoId: eoProfile.id },
    });
    if (!event) {
      return { orders: [] };
    }

    const orders = await (prisma as any).order.findMany({
      where: { eventId: id, status: 'PAID' },
      select: {
        id: true,
        user: { select: { name: true } },
        category: { select: { name: true } },
        quantity: true,
        totalAmount: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'desc' },
      take: limit,
    });

    return {
      orders: orders.map((o: any) => ({
        orderId: o.id,
        buyerName: o.user?.name || 'Anonymous',
        categoryName: o.category?.name,
        qty: o.quantity,
        amount: o.totalAmount,
        paidAt: o.paidAt,
      })),
    };
  });

  fastify.get('/staff', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;

    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const targetEoId = await resolveEoId(user);

    if (!targetEoId) {
      return reply.code(400).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
    }

    const acceptedInvites = await (prisma as any).staffInvite.findMany({
      where: { eoId: targetEoId, status: 'ACCEPTED' },
      select: { email: true },
    });

    const staffEmails = acceptedInvites.map((inv: any) => inv.email?.toLowerCase()).filter(Boolean);
    const staffUsers = await (prisma as any).user.findMany({
      where: {
        role: 'EO_STAFF',
        email: { in: staffEmails },
      },
    });

    return { data: staffUsers };
  });

  fastify.get('/profile', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    
    if (!user?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      const targetEoId = await resolveEoId(user);
      if (!targetEoId) {
        return reply.code(404).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
      }

      const eoProfile = await (prisma as any).eoProfile.findUnique({
        where: { id: targetEoId },
        include: { user: { select: { id: true, name: true, email: true, phone: true, avatar: true } } },
      });

      if (!eoProfile) {
        return reply.code(404).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
      }

      return { data: eoProfile };
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  fastify.put('/profile', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    const { companyName, bankName, bankAccount, commission } = req.body as {
      companyName?: string;
      bankName?: string;
      bankAccount?: string;
      commission?: number;
    };

    if (user.role !== 'EO_ADMIN') {
      return reply.code(403).send({ error: 'Only EO Admin can update profile' });
    }

    const eoProfile = await (prisma as any).eoProfile.findUnique({
      where: { userId: user.id },
    });

    if (!eoProfile) {
      return reply.code(404).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
    }

    const updated = await (prisma as any).eoProfile.update({
      where: { id: eoProfile.id },
      data: {
        ...(companyName && { companyName }),
        ...(bankName && { bankName }),
        ...(bankAccount && { bankAccount }),
        ...(commission !== undefined && { commission }),
      },
    });

    return { data: updated };
  });
}
