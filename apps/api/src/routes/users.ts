import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';
import { z } from 'zod';

const prisma = new PrismaClient();

const updateProfileSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  phone: z.string().regex(/^(\+62|62|0)[0-9]{9,12}$/).optional(),
  city: z.string().optional(),
  bio: z.string().max(500).optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const authUser = (req as any).user as { id: string };
    if (!authUser?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const userId = authUser.id;

    try {
      const [activeTickets, ordersCount, gameProfile, referralsCount, recentOrders, recentTickets] = await Promise.all([
        prisma.ticket.count({ where: { userId, status: 'ACTIVE' } }),
        prisma.order.count({ where: { userId } }),
        prisma.userGameProfile.findUnique({ where: { userId }, select: { totalXp: true } }),
        prisma.referralTransaction.count({ where: { referrerId: userId } }),
        prisma.order.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            createdAt: true,
            finalAmount: true,
            event: { select: { title: true } },
          },
        }),
        prisma.ticket.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            createdAt: true,
            ticketCode: true,
            category: { select: { name: true } },
          },
        }),
      ]);

      const activities = [
        ...recentOrders.map((order) => ({
          id: `order-${order.id}`,
          type: 'ORDER',
          title: `Pesanan ${order.status}`,
          subtitle: `${order.event?.title || 'Event'} • Rp${Number(order.finalAmount || 0).toLocaleString('id-ID')}`,
          createdAt: order.createdAt,
          targetPath: `/dashboard/orders/${order.id}`,
        })),
        ...recentTickets.map((ticket) => ({
          id: `ticket-${ticket.id}`,
          type: 'TICKET',
          title: `Tiket ${ticket.status}`,
          subtitle: `${ticket.category?.name || ticket.ticketCode}`,
          createdAt: ticket.createdAt,
          targetPath: `/dashboard/my-tickets/tickets/${ticket.id}`,
        })),
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8);

      return {
        stats: {
          activeTickets,
          orders: ordersCount,
          points: gameProfile?.totalXp || 0,
          referrals: referralsCount,
        },
        activities,
      };
    } catch (error) {
      console.error('[GET /users/dashboard]', error);
      return reply.code(500).send({ error: 'Gagal memuat dashboard' });
    }
  });

  fastify.get('/me', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const authUser = (req as any).user;
    
    if (!authUser?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const profile = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: {
          id: true, email: true, name: true, phone: true, city: true, bio: true,
          role: true, status: true, isVerified: true, avatar: true, referralCode: true,
          twoFAEnabled: true, createdAt: true, updatedAt: true,
        },
      });

      if (!profile) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return profile;
    } catch (error) {
      console.error('[GET /users/me]', error);
      return reply.code(500).send({ error: 'Gagal memuat profil' });
    }
  });

  fastify.patch('/me', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const data = updateProfileSchema.parse(req.body);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return { id: updated.id, name: updated.name, phone: updated.phone, city: updated.city, bio: updated.bio };
  });

  fastify.post('/me/avatar', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return reply.code(400).send({ error: 'Content-Type must be multipart/form-data' });
    }

    // In production: handle file upload to R2/S3, resize with Sharp
    // For now: accept base64 or return mock
    const body = await req.body as any;
    const avatarUrl = body.avatar?.data || body.avatarUrl;

    if (!avatarUrl) {
      return reply.code(400).send({ error: 'No image provided' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatar: avatarUrl },
    });

    return { avatar: updated.avatar };
  });

  fastify.post('/me/change-password', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.passwordHash) {
      return reply.code(400).send({ error: 'Cannot change password for OAuth users' });
    }

    const argon2 = (await import('argon2')).default;
    const valid = await argon2.verify(dbUser.passwordHash, currentPassword);
    if (!valid) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return { message: 'Password changed successfully' };
  });

  fastify.get('/me/sessions', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    try {
      const sessions = await prisma.session.findMany({
        where: { userId: user.id, isActive: true },
        select: { id: true, deviceName: true, deviceType: true, browser: true, os: true, ipAddress: true, city: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
      });
      return { data: sessions };
    } catch (error) {
      console.error('[SESSIONS]', error);
      return reply.code(500).send({ error: 'Failed to load sessions' });
    }
  });

  fastify.delete('/me/sessions/:sessionId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { sessionId } = req.params as any;

    await prisma.session.updateMany({
      where: { id: sessionId, userId: user.id },
      data: { isActive: false },
    });

    return { message: 'Session terminated' };
  });

  fastify.delete('/me/sessions', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const authHeader = req.headers.authorization;

    // Get current session ID from token or just exclude current
    // For simplicity, we'll logout all except the most recent
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (sessions.length > 0) {
      await prisma.session.updateMany({
        where: { userId: user.id, isActive: true, id: { not: sessions[0].id } },
        data: { isActive: false },
      });
    }

    return { message: 'All other sessions logged out' };
  });

  fastify.get('/check-email', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { email } = req.query as { email: string };
    if (!email) {
      return reply.code(400).send({ error: 'Email required' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        return { exists: false };
      }

      return {
        exists: true,
        id: user.id,
        name: user.name,
        email: user.email,
      };
    } catch (error) {
      console.error('[GET /users/check-email]', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
