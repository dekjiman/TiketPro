import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';

const prisma = new PrismaClient();

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const query = req.query as any;
    const page = parseInt(query?.page as string) || 1;
    const limit = Math.min(parseInt(query?.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const [items, total, unread] = await Promise.all([
      (prisma as any).notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (prisma as any).notification.count({ where: { userId: user.id } }),
      (prisma as any).notification.count({ where: { userId: user.id, isRead: false } }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), unread },
    };
  });

  fastify.post('/:id/read', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const { id } = req.params as { id: string };

    const item = await (prisma as any).notification.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!item) return reply.code(404).send({ error: 'Notification not found', code: 'NOTIFICATION_NOT_FOUND' });

    await (prisma as any).notification.update({
      where: { id },
      data: { isRead: true },
    });

    return { success: true };
  });

  fastify.post('/read-all', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    await (prisma as any).notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  });
}
