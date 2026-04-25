import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from './auth.js';

const prisma = new PrismaClient();

const settingsSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const bulkSettingsSchema = z.object({
  settings: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })),
});

const CATEGORIES = ['general', 'email', 'payment', 'security', 'maintenance'];

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const { category } = req.query as { category?: string };
    
    const where = category ? { category } : {};
    const settings = await (prisma as any).settings.findMany({ where });

    return { data: settings };
  });

  fastify.get('/:key', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const { key } = req.params as { key: string };
    const setting = await (prisma as any).settings.findUnique({ where: { key } });

    if (!setting) {
      return reply.code(404).send({ error: 'Setting not found' });
    }

    return { data: setting };
  });

  fastify.put('/:key', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const { key } = req.params as { key: string };
    const { value } = settingsSchema.parse(req.body);
    const category = (req.body as any).category || 'general';

    const setting = await (prisma as any).settings.upsert({
      where: { key },
      update: { value },
      create: { key, value, category },
    });

    return { data: setting };
  });

  fastify.put('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const { settings } = bulkSettingsSchema.parse(req.body);

    const results = await Promise.all(
      settings.map((s: any) =>
        (prisma as any).settings.upsert({
          where: { key: s.key },
          update: { value: s.value },
          create: { key: s.key, value: s.value, category: 'general' },
        })
      )
    );

    return { data: results };
  });

  fastify.get('/categories', async (req: FastifyRequest, reply: FastifyReply) => {
    return { data: CATEGORIES };
  });
}