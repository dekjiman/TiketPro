import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, Role } from '@prisma/client';
import { authenticate } from './auth.js';
import { authorize, type UserRole } from '../middleware/roles.js';
import { z } from 'zod';

const prisma = new PrismaClient();
type AuditActor = { id: string };

async function logAdminAction(
  actor: AuditActor,
  action: string,
  ipAddress: string,
  meta: Record<string, unknown> = {},
  targetUserId?: string
) {
  await prisma.auditLog.create({
    data: {
      userId: targetUserId,
      actorId: actor.id,
      event: action,
      level: 'WARN',
      ipAddress,
      meta: JSON.stringify(meta),
    },
  });
}

async function createNotifications(userIds: string[], payload: { type: string; title: string; body: string; data?: any }) {
  if (!userIds.length) return;
  await (prisma as any).notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      data: payload.data || null,
    })),
  });
}

const listUsersSchema = z.object({
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'BANNED']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const updateUserRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

export async function adminUserRoutes(fastify: FastifyInstance) {

  fastify.get('/users', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = listUsersSchema.parse(req.query as any);
    const { search, role, status } = parsed;
    const page = parsed.page || 1;
    const limit = parsed.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, phone: true, role: true, status: true,
          isVerified: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, totalPages: Math.ceil(total / limit) };
  });

  fastify.get('/users/:id', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const profile = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, city: true, role: true, status: true,
        isVerified: true, twoFAEnabled: true, failedAttempts: true, lockedUntil: true,
        avatar: true, bio: true, referralCode: true, createdAt: true,
      },
    });

    if (!profile) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const sessions = await prisma.session.findMany({
      where: { userId: id, isActive: true },
      select: { id: true, browser: true, os: true, ipAddress: true, city: true, createdAt: true },
    });

    const activities = await prisma.auditLog.findMany({
      where: { userId: id },
      select: { id: true, event: true, ipAddress: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { profile, sessions, activities };
  });

  fastify.patch('/users/:id/status', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    const actor = (req as any).user as { id: string };

    const validStatuses = ['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'BANNED'];
    if (!validStatuses.includes(status)) {
      return reply.code(400).send({ error: 'Invalid status' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
    await logAdminAction(actor, 'ADMIN_USER_STATUS_UPDATED', req.ip, { status }, id);

    return updated;
  });

  fastify.patch('/users/:id/role', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { role: newRole } = updateUserRoleSchema.parse(req.body);
    const actor = (req as any).user as { id: string };

    const updated = await prisma.user.update({
      where: { id },
      data: { role: newRole },
      select: { id: true, role: true },
    });
    await logAdminAction(actor, 'ADMIN_USER_ROLE_UPDATED', req.ip, { role: newRole }, id);

    return updated;
  });

  fastify.delete('/users/:id', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const currentUser = (req as any).user as { id: string };

    if (currentUser.id === id) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }

    await prisma.user.delete({ where: { id } });
    await logAdminAction(currentUser, 'ADMIN_USER_DELETED', req.ip, {}, id);

    return { message: 'User deleted' };
  });

fastify.get('/stats', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const [totalEo, totalEvents, pendingEo, pendingEvents] = await Promise.all([
        prisma.user.count({ where: { role: 'EO_ADMIN' } }),
        prisma.event.count(),
        prisma.user.count({ where: { role: 'EO_ADMIN', status: 'PENDING_APPROVAL' } }),
        prisma.event.count({ where: { status: 'REVIEW' } }),
      ]);

      const pendingEoList = await prisma.user.findMany({
        where: { role: 'EO_ADMIN', status: 'PENDING_APPROVAL' },
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const pendingEventsList = await (prisma as any).event.findMany({
        where: { status: 'REVIEW' },
        select: { id: true, title: true, slug: true, city: true, startDate: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const eoProfiles = await (prisma as any).eoProfile.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
          events: { select: { id: true } },
        },
        take: 10,
      });

      const eventsByEo = eoProfiles.map((eo: any) => ({
        id: eo.id,
        companyName: eo.companyName,
        userName: eo.user.name,
        eventCount: eo.events.length,
      }));

      return {
        stats: { totalEo, totalEvents, pendingEo, pendingEvents },
        pendingEoList,
        pendingEventsList,
        eventsByEo,
      };
    } catch (error) {
      console.error('[ADMIN_STATS]', error);
      return reply.code(500).send({ error: 'Failed to load stats' });
    }
  });

  // ========== MODERASI EVENT: LIST ALL EVENTS ==========
  fastify.get('/events', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as any;
    const { status, search } = query;
    const page = parseInt(query?.page as string) || 1;
    const limit = parseInt(query?.limit as string) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
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
        include: { 
          eo: { include: { user: { select: { name: true, email: true } } } } 
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (prisma as any).event.count({ where }),
    ]);

    return { events, totalPages: Math.ceil(total / limit), total };
  });

  // ========== MODERASI EVENT: APPROVE ==========
  fastify.post('/events/:id/approve', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const actor = (req as any).user as { id: string };

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const ev = await tx.event.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          adminNote: 'Approved by admin',
        },
      });
      await tx.ticketCategory.updateMany({
        where: { eventId: id },
        data: { status: 'ACTIVE' },
      });
      return ev;
    });
    await (prisma as any).eventComment.create({
      data: {
        eventId: id,
        authorId: actor.id,
        authorRole: 'SUPER_ADMIN',
        message: 'Event disetujui dan dipublikasikan oleh admin.',
      },
    }).catch(() => null);

    const eoProfile = await (prisma as any).eoProfile.findUnique({
      where: { id: event.eoId },
      select: { userId: true },
    });
    const staffInvites = await (prisma as any).staffInvite.findMany({
      where: { eoId: event.eoId, status: 'ACCEPTED' },
      select: { email: true },
    });
    const staffUsers = await (prisma as any).user.findMany({
      where: { email: { in: staffInvites.map((s: any) => s.email) } },
      select: { id: true },
    });
    const targets = Array.from(new Set([eoProfile?.userId, ...staffUsers.map((s: any) => s.id)].filter(Boolean)));
    await createNotifications(targets as string[], {
      type: 'EVENT_APPROVED',
      title: `Event disetujui: ${event.title}`,
      body: 'Event Anda sudah disetujui admin dan status menjadi PUBLISHED.',
      data: { eventId: id },
    });
    await logAdminAction(actor, 'ADMIN_EVENT_APPROVED', req.ip, { status: updated.status });

    return { message: 'Event approved and published', event: updated };
  });

  // ========== MODERASI EVENT: REJECT ==========
  fastify.post('/events/:id/reject', { preHandler: [authenticate, authorize('SUPER_ADMIN')] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    const actor = (req as any).user as { id: string };

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const updated = await (prisma as any).event.update({
      where: { id },
      data: {
        status: 'REJECTED',
        cancelReason: reason || 'Rejected by admin',
      },
    });
    await (prisma as any).eventComment.create({
      data: {
        eventId: id,
        authorId: actor.id,
        authorRole: 'SUPER_ADMIN',
        message: `Event ditolak oleh admin. Alasan: ${reason || 'Rejected by admin'}`,
      },
    }).catch(() => null);

    const eoProfile = await (prisma as any).eoProfile.findUnique({
      where: { id: event.eoId },
      select: { userId: true },
    });
    const staffInvites = await (prisma as any).staffInvite.findMany({
      where: { eoId: event.eoId, status: 'ACCEPTED' },
      select: { email: true },
    });
    const staffUsers = await (prisma as any).user.findMany({
      where: { email: { in: staffInvites.map((s: any) => s.email) } },
      select: { id: true },
    });
    const targets = Array.from(new Set([eoProfile?.userId, ...staffUsers.map((s: any) => s.id)].filter(Boolean)));
    await createNotifications(targets as string[], {
      type: 'EVENT_REJECTED',
      title: `Event ditolak: ${event.title}`,
      body: reason || 'Event ditolak oleh admin.',
      data: { eventId: id },
    });
    await logAdminAction(actor, 'ADMIN_EVENT_REJECTED', req.ip, { reason: reason || 'Rejected by admin' });

    return { message: 'Event rejected', event: updated };
  });
}
