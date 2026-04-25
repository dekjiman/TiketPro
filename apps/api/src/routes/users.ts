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


}