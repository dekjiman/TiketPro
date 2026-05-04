import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
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

  fastify.post('/upload/logo', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded', code: 'NO_FILE' });
    }

    const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
    if (!allowedMimeTypes.has(file.mimetype)) {
      return reply.code(400).send({ error: 'Invalid file type', code: 'INVALID_FILE_TYPE' });
    }

    const uploadDir = path.join(process.cwd(), 'public/uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = file.mimetype === 'image/svg+xml' ? 'svg' : 'webp';
    const fileName = `site-logo-${Date.now()}.${extension}`;
    const filePath = path.join(uploadDir, fileName);

    if (file.mimetype === 'image/svg+xml') {
      await fs.writeFile(filePath, await file.toBuffer());
    } else {
      const buffer = await file.toBuffer();
      await sharp(buffer)
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toFile(filePath);
    }

    const logoUrl = `/public/uploads/${fileName}`;
    const setting = await (prisma as any).settings.upsert({
      where: { key: 'site_logo' },
      update: { value: logoUrl, category: 'general' },
      create: { key: 'site_logo', value: logoUrl, category: 'general' },
    });

    return { data: setting, url: logoUrl };
  });

  fastify.get('/categories', async (req: FastifyRequest, reply: FastifyReply) => {
    return { data: CATEGORIES };
  });
}
