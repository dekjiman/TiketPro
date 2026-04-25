import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from './auth.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

const inviteSchema = z.object({
  email: z.string().email(),
  message: z.string().optional(),
});

const INVITE_EXPIRY_DAYS = 7;

function generateInviteToken(email: string, eoId: string): string {
  const data = `${email}:${eoId}:${Date.now()}`;
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret').update(data).digest('hex').slice(0, 32);
}

function generateEmailHash(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
}

export async function eoRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

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

    const token = generateInviteToken(email, eoProfile.id);
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

    const inviteUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/register?invite=${token}&eoId=${eoProfile.id}`;

    const emailBody = message
      ? `${message}\n\nInvite link: ${inviteUrl}`
      : `Anda diundang untuk bergabung sebagai Staff di ${eoProfile.companyName}.\n\nKlik link berikut untuk mendaftar: ${inviteUrl}\n\nLink berlaku selama ${INVITE_EXPIRY_DAYS} hari.`;

    try {
      const { sendEmail } = await import('../services/email.js');
      await sendEmail({
        to: email,
        subject: `Undangan Staff - ${eoProfile.companyName}`,
        html: `<p>${emailBody.replace(/\n/g, '<br>')}</p>`,
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

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile) {
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }

    const { status, search, page = 1, limit = 20 } = req.query as any;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = { eoId: eoProfile.id };
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
    const limit = parseInt(req.query.limit as string) || 20;

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

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    const targetEoId = user.role === 'EO_ADMIN' ? eoProfile?.id : (req.query as any).eoId;

    if (!targetEoId) {
      return reply.code(400).send({ error: 'EO Profile not found', code: 'EO_PROFILE_NOT_FOUND' });
    }

    const staffUsers = await (prisma as any).user.findMany({
      where: { invitedBy: user.id, role: 'EO_STAFF' },
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
      const eoProfile = await (prisma as any).eoProfile.findUnique({
        where: { userId: user.id },
        include: { user: { select: { id: true, name: true, email: true, phone: true, avatar: true } } },
      });

      if (!eoProfile) {
        return { data: {
          id: null,
          companyName: '',
          bankName: '',
          bankAccount: '',
          commission: 0.05,
          user: { id: user.id, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar },
        }};
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