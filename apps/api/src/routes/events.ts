import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import sharp from 'sharp';
import { authenticate } from './auth.js';
import { initStock } from '../services/redis.js';
import { redis } from '../services/redis.js';

const prisma = new PrismaClient();
type AuditActor = { id: string; role?: string };

async function logSuperAdminAction(actor: AuditActor, action: string, targetId: string, ipAddress: string, meta: Record<string, unknown> = {}) {
  if (actor.role !== 'SUPER_ADMIN') return;
  await prisma.auditLog.create({
    data: {
      userId: targetId,
      actorId: actor.id,
      event: action,
      level: 'WARN',
      ipAddress,
      meta: JSON.stringify(meta),
    },
  });
}

const baseEventSchema = z.object({
  title: z.string().min(3).max(180),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  city: z.string().min(1).max(120),
  province: z.string().max(120).optional(),
  posterUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

const eventSchema = baseEventSchema.refine((data) => new Date(data.endDate) > new Date(data.startDate), {
  message: 'endDate must be after startDate',
  path: ['endDate'],
});

const updateEventSchema = baseEventSchema.partial().refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.endDate) > new Date(data.startDate);
  }
  return true;
}, {
  message: 'endDate must be after startDate',
  path: ['endDate'],
});
const isBase64ImageDataUrl = (value?: string | null) =>
  !!value && /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value.trim());

const baseVenueSchema = z.object({
  name: z.string().min(3),
  address: z.string().min(5),
  city: z.string().min(1),
  province: z.string().optional(),
  capacity: z.number().int().min(0),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  facilities: z.string().optional(),
  mapUrl: z.string().optional(),
  notes: z.string().optional(),
  timezone: z.string().min(1),
});

const createVenueSchema = baseVenueSchema.refine((data) => {
  const hasLat = data.latitude !== undefined;
  const hasLng = data.longitude !== undefined;
  return hasLat === hasLng;
}, {
  message: "Latitude and longitude must both be provided or both omitted",
  path: ["latitude"],
});

const updateVenueSchema = baseVenueSchema.partial().refine((data) => {
  const hasLat = data.latitude !== undefined;
  const hasLng = data.longitude !== undefined;
  return hasLat === hasLng;
}, {
  message: "Latitude and longitude must both be provided or both omitted",
  path: ["latitude"],
});

const baseRundownSchema = z.object({
  title: z.string().min(2),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  stage: z.string().optional(),
  description: z.string().optional(),
  sessionType: z.string().min(1),
  orderIndex: z.number().int().min(0),
  dayIndex: z.number().int().min(0),
  eventDate: z.string().datetime().optional(),
});

const createRundownSchema = baseRundownSchema.refine((data) => {
  if (data.endTime) {
    return new Date(data.endTime) > new Date(data.startTime);
  }
  return true;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

const updateRundownSchema = baseRundownSchema.partial().refine((data) => {
  if (data.endTime && data.startTime) {
    return new Date(data.endTime) > new Date(data.startTime);
  }
  return true;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

const lineupSchema = z.object({
  artistName: z.string().min(2).max(150),
  description: z.string().optional(),
  role: z.string().optional(),
  dayIndex: z.number().int().optional(),
  socialLinks: z.object({
    instagram: z.string().optional(),
    spotify: z.string().optional(),
    youtube: z.string().optional(),
  }).optional(),
});

const rundownSchema = z.object({
  title: z.string().min(2).max(150),
  startTime: z.string(),
  endTime: z.string().optional(),
  stage: z.string().optional(),
  description: z.string().optional(),
  sessionType: z.string().optional(),
  dayIndex: z.number().int().optional(),
});

const ticketCategorySchema = z.object({
  name: z.string().min(2).max(100),
  price: z.number().int().min(0),
  quota: z.number().int().positive(),
  description: z.string().optional(),
  saleStartAt: z.string().optional(),
  saleEndAt: z.string().optional(),
  maxPerOrder: z.number().int().min(1).optional(),
  maxPerAccount: z.number().int().min(1).optional(),
  templateType: z.enum(['system', 'custom']).optional(),
  isInternal: z.boolean().optional(),
  colorHex: z.string().optional(),
  orderIndex: z.number().int().optional(),
}).refine(data => {
  if (data.saleStartAt && data.saleEndAt) {
    return new Date(data.saleEndAt) > new Date(data.saleStartAt);
  }
  return true;
}, {
  message: 'saleEndAt must be after saleStartAt',
  path: ['saleEndAt'],
});

const galleryReorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    orderIndex: z.number().int().min(0),
  })).min(1),
});

const galleryVideoSchema = z.object({
  videoUrl: z.string().url(),
});

const eventCommentSchema = z.object({
  message: z.string().min(1).max(2000),
});

const roleMap: Record<string, string> = {
  headliner: 'HEADLINER', main_act: 'HEADLINER', main: 'HEADLINER',
  supporting: 'SUPPORTING', opening: 'OPENING_ACT', opening_act: 'OPENING_ACT',
  dj: 'DJ', host: 'HOST', mc: 'HOST',
  guest: 'SPECIAL_GUEST', special_guest: 'SPECIAL_GUEST',
};
const normalizeRole = (role: string) => {
  const key = (role || '').toLowerCase().replace(/\s+/g, '_');
  return roleMap[key] || 'SUPPORTING';
};

async function resolveManagedEvent(eventId: string, user: any) {
  const event = await (prisma as any).event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      eoId: true,
      status: true,
      title: true,
      shortDescription: true,
      description: true,
      posterUrl: true,
      startDate: true,
      endDate: true,
      publishedAt: true,
    },
  });

  if (!event) return { event: null, authorized: false };
  if (user.role === 'SUPER_ADMIN') return { event, authorized: true };

  const eoProfile = await (prisma as any).eoProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  return { event, authorized: !!eoProfile && eoProfile.id === event.eoId };
}

async function createEventWithUniqueSlug(baseSlug: string, data: any, maxRetry = 6) {
  let attempt = 0;
  while (attempt <= maxRetry) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
    try {
      return await (prisma as any).event.create({ data: { ...data, slug } });
    } catch (error: any) {
      if (error?.code === 'P2002' && attempt < maxRetry) {
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to generate unique slug');
}

function userFavoriteKey(userId: string) {
  return `favorites:events:${userId}`;
}

function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rest] = cookie.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return null;
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
    skipDuplicates: false,
  });
}

export async function eventRoutes(fastify: FastifyInstance) {
  // ========== IMAGE UPLOAD (REWORKED) ==========
  fastify.post('/:id/upload/:type', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const { id, type } = req.params as { id: string, type: 'poster' | 'banner' | 'thumbnail' | 'gallery' };
    const allowedTypes = new Set(['poster', 'banner', 'thumbnail', 'gallery']);
    if (!allowedTypes.has(type)) {
      return reply.code(400).send({ error: 'Invalid upload type', code: 'INVALID_UPLOAD_TYPE' });
    }

    // Permissions check
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    let isAuthorized = false;

    if (isSuperAdmin) {
      isAuthorized = true;
    } else {
      const event = await (prisma as any).event.findUnique({ where: { id } });
      const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
      
      if (event && eoProfile && event.eoId === eoProfile.id) {
        isAuthorized = true;
      } else if (user.role === 'EO_STAFF') {
        const staffInvite = await (prisma as any).staffInvite.findFirst({
          where: { 
            email: user.email, 
            eoId: event?.eoId, 
            status: 'ACCEPTED' 
          }
        });
        if (staffInvite) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return reply.code(403).send({ error: 'Forbidden', message: 'You do not have permission to upload to this event' });
    }
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const uploadDir = path.join(process.cwd(), 'public/uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const buffer = await data.toBuffer();
    const mimeType = data.mimetype || '';
    const isVideoUpload = type === 'gallery' && mimeType.startsWith('video/');
    
    if (type === 'poster') {
      const fileName = `${id}-${type}-${Date.now()}.webp`;
      const filePath = path.join(uploadDir, fileName);
      const sharpInstance = sharp(buffer);
      await sharpInstance.resize(800, 800, { fit: 'cover' }).webp().toFile(filePath);
      await (prisma as any).event.update({ where: { id }, data: { posterUrl: `/public/uploads/${fileName}` } });
      return { url: `/public/uploads/${fileName}`, fileName };
    } else if (type === 'banner') {
      const fileName = `${id}-${type}-${Date.now()}.webp`;
      const filePath = path.join(uploadDir, fileName);
      const sharpInstance = sharp(buffer);
      await sharpInstance.resize(1200, 630, { fit: 'cover' }).webp().toFile(filePath);
      await (prisma as any).event.update({ where: { id }, data: { bannerUrl: `/public/uploads/${fileName}` } });
      return { url: `/public/uploads/${fileName}`, fileName };
    } else if (type === 'thumbnail') {
      const fileName = `${id}-${type}-${Date.now()}.webp`;
      const filePath = path.join(uploadDir, fileName);
      const sharpInstance = sharp(buffer);
      await sharpInstance.resize(600, 600, { fit: 'cover' }).webp().toFile(filePath);
      await (prisma as any).event.update({ where: { id }, data: { thumbnailUrl: `/public/uploads/${fileName}` } });
    } else {
      let mediaUrl = '';
      let fileName = '';

      if (isVideoUpload) {
        const allowedVideoMime = new Set(['video/mp4', 'video/webm', 'video/ogg']);
        if (!allowedVideoMime.has(mimeType)) {
          return reply.code(400).send({
            error: 'Invalid video type. Allowed: MP4, WEBM, OGG',
            code: 'INVALID_VIDEO_TYPE',
          });
        }

        const ext = mimeType === 'video/webm' ? 'webm' : mimeType === 'video/ogg' ? 'ogg' : 'mp4';
        fileName = `${id}-${type}-${Date.now()}.${ext}`;
        const filePath = path.join(uploadDir, fileName);
        await fs.writeFile(filePath, buffer);
        mediaUrl = `/public/uploads/${fileName}`;
      } else {
        fileName = `${id}-${type}-${Date.now()}.webp`;
        const filePath = path.join(uploadDir, fileName);
        const sharpInstance = sharp(buffer);
        await sharpInstance.resize(1600, 900, { fit: 'inside', withoutEnlargement: true }).webp().toFile(filePath);
        mediaUrl = `/public/uploads/${fileName}`;
      }

      const latestImage = await (prisma as any).eventImage.findFirst({
        where: { eventId: id },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true },
      });
      await (prisma as any).eventImage.create({
        data: {
          eventId: id,
          imageUrl: mediaUrl,
          orderIndex: (latestImage?.orderIndex || 0) + 1,
        },
      });
      return { url: mediaUrl, fileName };
    }

    return { ok: true };
  });

  // ========== GALLERY MANAGEMENT ==========
  fastify.patch('/:id/gallery/reorder', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const user = req.user as any;
    const parsed = galleryReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });

    const itemIds = parsed.data.items.map(i => i.id);
    const existing = await (prisma as any).eventImage.findMany({
      where: { eventId: id, id: { in: itemIds } },
      select: { id: true },
    });

    if (existing.length !== itemIds.length) {
      return reply.code(400).send({ error: 'Some gallery items are invalid', code: 'INVALID_GALLERY_ITEMS' });
    }

    await (prisma as any).$transaction(
      parsed.data.items.map((item) =>
        (prisma as any).eventImage.update({
          where: { id: item.id },
          data: { orderIndex: item.orderIndex },
        })
      )
    );

    const images = await (prisma as any).eventImage.findMany({
      where: { eventId: id },
      orderBy: { orderIndex: 'asc' },
    });
    return { data: images };
  });

  fastify.delete('/:id/gallery/:imageId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, imageId } = req.params as { id: string; imageId: string };
    const user = req.user as any;

    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });

    const existing = await (prisma as any).eventImage.findFirst({
      where: { id: imageId, eventId: id },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: 'Gallery item not found', code: 'GALLERY_ITEM_NOT_FOUND' });

    await (prisma as any).eventImage.delete({ where: { id: imageId } });

    const images = await (prisma as any).eventImage.findMany({
      where: { eventId: id },
      orderBy: { orderIndex: 'asc' },
    });
    return { data: images };
  });

  fastify.post('/:id/gallery/video-url', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const user = req.user as any;
    const parsed = galleryVideoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });

    const latestImage = await (prisma as any).eventImage.findFirst({
      where: { eventId: id },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const media = await (prisma as any).eventImage.create({
      data: {
        eventId: id,
        imageUrl: parsed.data.videoUrl,
        orderIndex: (latestImage?.orderIndex || 0) + 1,
      },
    });
    return { data: media };
  });

  // ========== GET FULL EVENT DATA (FOR MANAGEMENT) ==========
 fastify.get('/:id/full', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
   const { id } = req.params as { id: string };
    const user = req.user as any;

    try {
        console.log('Fetching event with ID:', id); // Debug Log

        const event = await (prisma as any).event.findUnique({
            where: { id },
        include: {
            eo: true,
            lineups: true,
            rundowns: true,
            categories: {
                orderBy: { orderIndex: 'asc' },
                select: {
                    id: true,
                    eventId: true,
                    name: true,
                    description: true,
                    price: true,
                    quota: true,
                    sold: true,
                    saleStartAt: true,
                    saleEndAt: true,
                    maxPerOrder: true,
                    maxPerAccount: true,
                    templateType: true,
                    templateUrl: true,
                    isInternal: true,
                    colorHex: true,
                    orderIndex: true,
                    status: true,
                },
            },
            images: { orderBy: { orderIndex: 'asc' } },
            venues: true, // Pastikan ini sudah sesuai schema terbaru
            // Matikan dulu include yang lain untuk ngetes mana yang bikin berat/error
        },
        });

        if (!event) return reply.code(404).send({ error: 'Event not found' });

        console.log('Event found, checking EO Profile for User:', user?.id); // Debug Log

        const eoProfile = await (prisma as any).eoProfile.findUnique({ 
            where: { userId: user.id } 
        });

        // Logika pengecekan yang lebih aman
        const isSuperAdmin = user?.role === 'SUPER_ADMIN';
        const isOwner = eoProfile && event.eoId === eoProfile.id;

        if (!isOwner && !isSuperAdmin) {
            return reply.code(403).send({ error: 'Forbidden: You do not own this event' });
        }

        return event;

    } catch (error: any) {
        console.error('[FULL_EVENT_ERROR]', error);
        return reply.code(500).send({ 
            error: error.message || 'Internal Server Error', 
            code: 'INTERNAL_ERROR' 
        });
    }
});

  // ========== EVENT COMMENTS (EO <-> ADMIN DISCUSSION) ==========
  fastify.get('/:id/comments', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const user = req.user as any;
    const event = await (prisma as any).event.findUnique({ where: { id }, select: { id: true, eoId: true } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    let canAccess = user.role === 'SUPER_ADMIN';
    if (!canAccess && user.role === 'EO_ADMIN') {
      const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
      canAccess = !!eoProfile && eoProfile.id === event.eoId;
    }
    if (!canAccess && user.role === 'EO_STAFF') {
      const staffInvite = await (prisma as any).staffInvite.findFirst({
        where: { email: user.email?.toLowerCase(), eoId: event.eoId, status: 'ACCEPTED' },
      });
      canAccess = !!staffInvite;
    }
    if (!canAccess) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });

    const comments = await (prisma as any).eventComment.findMany({
      where: { eventId: id },
      include: { author: { select: { id: true, name: true, role: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { data: comments };
  });

  fastify.post('/:id/comments', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const user = req.user as any;
    const parsed = eventCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const event = await (prisma as any).event.findUnique({
      where: { id },
      select: { id: true, eoId: true, title: true },
    });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    let canAccess = user.role === 'SUPER_ADMIN';
    if (!canAccess && user.role === 'EO_ADMIN') {
      const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
      canAccess = !!eoProfile && eoProfile.id === event.eoId;
    }
    if (!canAccess && user.role === 'EO_STAFF') {
      const staffInvite = await (prisma as any).staffInvite.findFirst({
        where: { email: user.email?.toLowerCase(), eoId: event.eoId, status: 'ACCEPTED' },
      });
      canAccess = !!staffInvite;
    }
    if (!canAccess) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });

    const created = await (prisma as any).eventComment.create({
      data: {
        eventId: id,
        authorId: user.id,
        authorRole: user.role,
        message: parsed.data.message.trim(),
      },
      include: { author: { select: { id: true, name: true, role: true, email: true } } },
    });

    // Notify opposite side:
    // EO comments -> notify SUPER_ADMIN
    // SUPER_ADMIN comments -> notify EO owner + accepted EO staff
    if (user.role === 'SUPER_ADMIN') {
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
      const targetIds = Array.from(new Set([eoProfile?.userId, ...staffUsers.map((s: any) => s.id)].filter(Boolean)));
      await createNotifications(targetIds as string[], {
        type: 'EVENT_COMMENT_ADMIN',
        title: `Komentar Admin pada Event: ${event.title}`,
        body: parsed.data.message.trim().slice(0, 160),
        data: { eventId: event.id },
      });
    } else {
      const admins = await (prisma as any).user.findMany({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
      await createNotifications(admins.map((a: any) => a.id), {
        type: 'EVENT_COMMENT_EO',
        title: `Komentar EO pada Event: ${event.title}`,
        body: parsed.data.message.trim().slice(0, 160),
        data: { eventId: event.id },
      });
    }

    return { data: created };
  });

  // ========== LIST EVENTS ==========
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { city, search, page, limit, offset } = req.query as any;
    const where: any = { status: 'PUBLISHED' };
    
    if (city) where.city = city;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }

    const limitNum = Math.max(1, parseInt(limit) || 20);
    const hasOffset = offset !== undefined && offset !== null && offset !== '';
    const offsetNum = hasOffset ? Math.max(0, parseInt(offset) || 0) : 0;
    const pageNum = hasOffset ? Math.floor(offsetNum / limitNum) + 1 : Math.max(1, parseInt(page) || 1);
    const skip = hasOffset ? offsetNum : (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      (prisma as any).event.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          shortDescription: true,
          posterUrl: true,
          bannerUrl: true,
          thumbnailUrl: true,
          startDate: true,
          endDate: true,
          city: true,
          province: true,
          status: true,
          eo: { select: { id: true, companyName: true, user: { select: { name: true } } } },
          categories: { where: { status: 'ACTIVE', isInternal: false }, orderBy: { orderIndex: 'asc' } },
          images: { orderBy: { orderIndex: 'asc' } },
        },
        orderBy: { startDate: 'asc' },
        skip,
        take: limitNum,
      }),
      (prisma as any).event.count({ where }),
    ]);
    return {
      data: events,
      // Backward compatibility for consumers still expecting `events`.
      events,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        offset: skip,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  });


  // ========== GET EVENT DETAIL (PUBLIC) ==========
  fastify.get('/:slugOrId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slugOrId } = req.params as any;
    try {
      let event = await (prisma as any).event.findFirst({
        where: {
          status: 'PUBLISHED',
          OR: [{ slug: slugOrId }, { id: slugOrId }]
        },
        select: {
          id: true,
          eoId: true,
          title: true,
          slug: true,
          shortDescription: true,
          description: true,
          posterUrl: true,
          bannerUrl: true,
          thumbnailUrl: true,
          startDate: true,
          endDate: true,
          isMultiDay: true,
          city: true,
          province: true,
          status: true,
          isFeatured: true,
          publishedAt: true,
          eo: { select: { id: true, companyName: true, user: { select: { name: true } } } },
          venues: true,
          categories: {
            where: { isInternal: false },
            orderBy: { orderIndex: 'asc' }
          },
          images: { orderBy: { orderIndex: 'asc' } },
          lineups: { orderBy: [{ dayIndex: 'asc' }, { orderIndex: 'asc' }] },
          rundowns: { orderBy: [{ dayIndex: 'asc' }, { startTime: 'asc' }] },
        }
      });

      // Owner preview for unpublished events:
      // EO Admin owner (and Super Admin) may access draft/review via public detail URL.
      if (!event) {
        const authHeader = req.headers.authorization;
        const cookieToken = readCookieValue(req.headers.cookie, 'access_token');
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;
        const token = bearerToken || cookieToken;

        if (token) {
          try {
            const decoded = fastify.jwt.verify(token) as { id: string; role: string; email?: string };
            const candidate = await (prisma as any).event.findFirst({
              where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
              select: {
                id: true,
                eoId: true,
                title: true,
                slug: true,
                shortDescription: true,
                description: true,
                posterUrl: true,
                bannerUrl: true,
                thumbnailUrl: true,
                startDate: true,
                endDate: true,
                isMultiDay: true,
                city: true,
                province: true,
                status: true,
                isFeatured: true,
                publishedAt: true,
                eo: { select: { id: true, companyName: true, user: { select: { name: true } } } },
                venues: true,
                categories: {
                  where: { isInternal: false },
                  orderBy: { orderIndex: 'asc' }
                },
                images: { orderBy: { orderIndex: 'asc' } },
                lineups: { orderBy: [{ dayIndex: 'asc' }, { orderIndex: 'asc' }] },
                rundowns: { orderBy: [{ dayIndex: 'asc' }, { startTime: 'asc' }] },
              }
            });

            if (candidate) {
              let canPreview = decoded.role === 'SUPER_ADMIN';
              if (!canPreview && decoded.role === 'EO_ADMIN') {
                const eoProfile = await (prisma as any).eoProfile.findUnique({
                  where: { userId: decoded.id },
                  select: { id: true },
                });
                canPreview = !!eoProfile && eoProfile.id === candidate.eoId;
              }

              if (!canPreview && decoded.role === 'EO_STAFF') {
                const staffInvite = await (prisma as any).staffInvite.findFirst({
                  where: { email: decoded.email?.toLowerCase(), eoId: candidate.eoId, status: 'ACCEPTED' },
                });
                canPreview = !!staffInvite;
              }

              if (canPreview) {
                event = candidate;
              }
            }
          } catch {
            // Ignore invalid token and continue 404.
          }
        }
      }

      if (!event) return reply.code(404).send({ error: 'Event not found' });

      // Enrich categories with status
      const now = new Date();
      const enrichedCategories = (event.categories || []).map((cat: any) => {
        const dbStatus = String(cat.status || '').toUpperCase();
        let status = 'AVAILABLE';

        // Respect real-time sale window first for preview/detail.
        // DRAFT should not force UPCOMING when sale has started.
        if (dbStatus === 'CLOSED') status = 'CLOSED';
        else if (dbStatus === 'SOLD_OUT') status = 'SOLD_OUT';
        else if (cat.saleStartAt && now < new Date(cat.saleStartAt)) status = 'UPCOMING';
        else if (cat.saleEndAt && now > new Date(cat.saleEndAt)) status = 'CLOSED';
        else if (cat.sold >= cat.quota) status = 'SOLD_OUT';

        return { ...cat, isInternal: Boolean(cat.isInternal), status };
      });

      return {
        ...event,
        categories: enrichedCategories,
      };
    } catch (error: any) {
      console.error('[EVENT_DETAIL_ERROR]', error);
      return reply.code(500).send({ error: error.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // ========== EVENT FAVORITES (LOVE) ==========
  fastify.get('/:id/favorite-status', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const { id } = req.params as any;

    const event = await (prisma as any).event.findFirst({
      where: { OR: [{ slug: id }, { id }] },
      select: { id: true },
    });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const liked = (await redis.sismember(userFavoriteKey(user.id), event.id)) === 1;
    return { eventId: event.id, liked };
  });

  fastify.post('/:id/favorite', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const { id } = req.params as any;

    const event = await (prisma as any).event.findFirst({
      where: { OR: [{ slug: id }, { id }] },
      select: { id: true },
    });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const key = userFavoriteKey(user.id);
    const currentlyLiked = (await redis.sismember(key, event.id)) === 1;
    if (currentlyLiked) {
      await redis.srem(key, event.id);
    } else {
      await redis.sadd(key, event.id);
    }

    return { eventId: event.id, liked: !currentlyLiked };
  });
       

  // ========== CREATE EVENT ==========
  fastify.post('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!['SUPER_ADMIN', 'EO_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

      const data = eventSchema.parse(req.body);
      if (isBase64ImageDataUrl(data.posterUrl) || isBase64ImageDataUrl(data.bannerUrl) || isBase64ImageDataUrl(data.thumbnailUrl)) {
        return reply.code(400).send({
          error: 'Image fields must be URL/path to uploaded .webp file, base64 is not allowed',
          code: 'BASE64_IMAGE_NOT_ALLOWED',
        });
      }
    let eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    
    if (!eoProfile && user.role === 'EO_ADMIN') {
      eoProfile = await (prisma as any).eoProfile.create({
        data: { userId: user.id, companyName: user.name || 'My EO' },
      });
    }

    if (!eoProfile) {
      return reply.code(400).send({ error: 'EO Profile not found. Please complete your EO profile first.', code: 'EO_PROFILE_MISSING' });
    }

    // AUTO LOGIC: isMultiDay
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const isMultiDay = start.toDateString() !== end.toDateString();

    // AUTO LOGIC: Slug generation
    const baseSlug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const event = await createEventWithUniqueSlug(baseSlug, {
      title: data.title,
      shortDescription: data.shortDescription || '',
      description: data.description || '',
      posterUrl: data.posterUrl,
      bannerUrl: data.bannerUrl,
      thumbnailUrl: data.thumbnailUrl,
      isMultiDay,
      startDate: start,
      endDate: end,
      city: data.city,
      province: data.province || '',
      eoId: eoProfile.id,
      status: 'DRAFT',
    });

    return reply.code(201).send(event);
  });

   // ========== UPDATE EVENT ==========
   fastify.patch('/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;

     const managed = await resolveManagedEvent(id, req.user as any);
     if (!managed.event) {
       return reply.code(404).send({ error: 'Event not found' });
     }
     if (!managed.authorized) {
       return reply.code(403).send({ error: 'Unauthorized', message: 'You do not have permission to edit this event' });
     }

     const data = updateEventSchema.parse(req.body);
     if (isBase64ImageDataUrl(data.posterUrl) || isBase64ImageDataUrl(data.bannerUrl) || isBase64ImageDataUrl(data.thumbnailUrl)) {
       return reply.code(400).send({
         error: 'Image fields must be URL/path to uploaded .webp file, base64 is not allowed',
         code: 'BASE64_IMAGE_NOT_ALLOWED',
       });
     }
     const updateData: any = { ...data };
     if (managed.event.status === 'PUBLISHED' && userRole !== 'SUPER_ADMIN') {
       const restrictedFields = ['title', 'startDate', 'endDate', 'city', 'province'];
       const attempted = restrictedFields.filter((field) => field in updateData);
       if (attempted.length > 0) {
         return reply.code(400).send({
           error: 'Published event has restricted fields',
           code: 'PUBLISHED_FIELD_RESTRICTED',
           details: attempted,
         });
       }
     }
     
     if (data.startDate) updateData.startDate = new Date(data.startDate);
     if (data.endDate) updateData.endDate = new Date(data.endDate);

     // Re-compute isMultiDay if any date is changed
     if (data.startDate || data.endDate) {
       const start = updateData.startDate || new Date(managed.event.startDate);
       const end = updateData.endDate || new Date(managed.event.endDate);
       if (end <= start) {
         return reply.code(400).send({ error: 'endDate must be after startDate', code: 'INVALID_DATE_RANGE' });
       }
       updateData.isMultiDay = start.toDateString() !== end.toDateString();
     }

     const updatedEvent = await (prisma as any).event.update({
       where: { id },
       data: updateData,
     });
     return updatedEvent;
   });

  // ========== DELETE EVENT ==========
  fastify.delete('/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    // Permissions check
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    let isOwner = false;

    if (!isSuperAdmin) {
      const event = await (prisma as any).event.findUnique({ where: { id } });
      const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
      if (event && eoProfile && event.eoId === eoProfile.id) {
        isOwner = true;
      }
    }

    if (!isOwner && !isSuperAdmin) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    await (prisma as any).event.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { success: true };
  });

  // ========== VENUE ROUTES ==========
  fastify.post('/:id/venue', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    // Ownership Check
    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    // Check if venue already exists
    const existingVenue = await (prisma as any).eventVenue.findUnique({ where: { eventId: id } });
    if (existingVenue) {
      return reply.code(400).send({ error: 'Venue already exists for this event', code: 'VENUE_EXISTS' });
    }

    try {
      const data = createVenueSchema.parse(req.body);

      const venue = await (prisma as any).eventVenue.create({
        data: {
          eventId: id,
          name: data.name,
          address: data.address,
          city: data.city,
          province: data.province,
          capacity: data.capacity,
          latitude: data.latitude,
          longitude: data.longitude,
          facilities: data.facilities,
          mapUrl: data.mapUrl,
          notes: data.notes,
          timezone: data.timezone,
        },
      });
      return { data: venue };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation error', code: 'VALIDATION_ERROR', details: error.errors });
      }
      console.error('[VENUE_CREATE_ERROR]', error);
      return reply.code(500).send({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  fastify.patch('/:id/venue', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    // Ownership Check
    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    try {
      const data = updateVenueSchema.parse(req.body);

      const venue = await (prisma as any).eventVenue.upsert({
        where: { eventId: id },
        update: {
          ...data,
        },
        create: {
          eventId: id,
          ...data,
        },
      });
      return { data: venue };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation error', code: 'VALIDATION_ERROR', details: error.errors });
      }
      console.error('[VENUE_UPDATE_ERROR]', error);
      return reply.code(500).send({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  fastify.get('/:slugOrId/venue', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slugOrId } = req.params as any;
    const event = await (prisma as any).event.findFirst({
      where: {
        status: 'PUBLISHED',
        OR: [
          { id: slugOrId },
          { slug: slugOrId },
        ],
      },
      select: { id: true, venues: true },
    });
    if (!event) {
      return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }
    return { data: event.venues || null };
  });

  fastify.delete('/:id/venue', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    await (prisma as any).eventVenue.delete({ where: { eventId: id } }).catch(() => {});
    return { success: true };
  });

  // ========== LINEUP ROUTES ==========

  // POST /events/:id/lineup
  fastify.post('/:id/lineup', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const body = req.body as any;

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const lineup = await (prisma as any).eventLineup.create({
      data: {
        eventId: id,
        artistName: body.artistName,
        photoUrl: body.photoUrl || null,
        description: body.description || null,
        role: normalizeRole(body.role),
        orderIndex: body.orderIndex ?? 0,
        dayIndex: body.dayIndex ?? null,
        socialLinks: body.socialLinks ? JSON.parse(JSON.stringify(body.socialLinks)) : null,
      },
    });
    return reply.code(201).send({ data: lineup });
  });

  // GET /events/:slugOrId/lineup
  fastify.get('/:slugOrId/lineup', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slugOrId } = req.params as any;
    const event = await (prisma as any).event.findFirst({
      where: { status: 'PUBLISHED', OR: [{ slug: slugOrId }, { id: slugOrId }] },
      select: { id: true },
    });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const lineups = await (prisma as any).eventLineup.findMany({
      where: { eventId: event.id },
      orderBy: [
        { dayIndex: 'asc' },
        { orderIndex: 'asc' },
      ],
    });
    return { data: lineups };
  });

  // PUT /events/:id/lineup (batch replace)
  fastify.put('/:id/lineup', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { lineups } = req.body as { lineups: any[] };

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    await (prisma as any).eventLineup.deleteMany({ where: { eventId: id } });

    const created = await Promise.all(lineups.map((l, index) =>
      (prisma as any).eventLineup.create({
        data: {
          eventId: id,
          artistName: l.artistName || l.name,
          role: normalizeRole(l.role),
          orderIndex: index + 1,
          dayIndex: l.dayIndex ?? null,
          description: l.description || null,
          photoUrl: l.photoUrl || null,
          socialLinks: l.socialLinks ? JSON.parse(JSON.stringify(l.socialLinks)) : null,
        },
      })
    ));

    return { data: created };
  });

  // PATCH /events/:id/lineup/:lineupId
  fastify.patch('/:id/lineup/:lineupId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, lineupId } = req.params as any;
    const user = req.user as any;
    const body = req.body as any;

    const existing = await (prisma as any).eventLineup.findUnique({ where: { id: lineupId } });
    if (!existing) return reply.code(404).send({ error: 'Lineup not found', code: 'LINEUP_NOT_FOUND' });

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const updateData: any = {};
    if (body.artistName !== undefined) updateData.artistName = body.artistName;
    if (body.photoUrl !== undefined) updateData.photoUrl = body.photoUrl;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.role !== undefined) updateData.role = normalizeRole(body.role);
    if (body.orderIndex !== undefined) updateData.orderIndex = body.orderIndex;
    if (body.dayIndex !== undefined) updateData.dayIndex = body.dayIndex;
    if (body.socialLinks !== undefined) updateData.socialLinks = JSON.parse(JSON.stringify(body.socialLinks));

    const lineup = await (prisma as any).eventLineup.update({
      where: { id: lineupId },
      data: updateData,
    });
    return { data: lineup };
  });

  // DELETE /events/:id/lineup/:lineupId
  fastify.delete('/:id/lineup/:lineupId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, lineupId } = req.params as any;
    const user = req.user as any;

    const existing = await (prisma as any).eventLineup.findUnique({ where: { id: lineupId } });
    if (!existing) return reply.code(404).send({ error: 'Lineup not found', code: 'LINEUP_NOT_FOUND' });

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    await (prisma as any).eventLineup.delete({ where: { id: lineupId } });
    return { data: { success: true } };
  });

  // POST /events/:id/lineup/:lineupId/photo - Upload lineup photo (converted to WebP)
  fastify.post('/:id/lineup/:lineupId/photo', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, lineupId } = req.params as { id: string; lineupId: string };
    const user = req.user as any;

    // Verify event exists and user has permission
    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    let isAuthorized = false;
    if (user.role === 'SUPER_ADMIN') {
      isAuthorized = true;
    } else if (eoProfile && event.eoId === eoProfile.id) {
      isAuthorized = true;
    } else if (user.role === 'EO_STAFF') {
      const staffInvite = await (prisma as any).staffInvite.findFirst({
        where: { email: user.email, eoId: event.eoId, status: 'ACCEPTED' }
      });
      if (staffInvite) isAuthorized = true;
    }
    if (!isAuthorized) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    // Verify lineup belongs to this event
    const lineup = await (prisma as any).eventLineup.findUnique({
      where: { id: lineupId, eventId: id }
    });
    if (!lineup) return reply.code(404).send({ error: 'Lineup not found', code: 'LINEUP_NOT_FOUND' });

    // Get uploaded file
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded', code: 'NO_FILE' });

    // Validate file type
    const mimeType = data.mimetype || '';
    if (!mimeType.startsWith('image/')) {
      return reply.code(400).send({ error: 'Only image files are allowed', code: 'INVALID_FILE_TYPE' });
    }

    try {
      // Create upload directory if it doesn't exist
      const uploadDir = path.join(process.cwd(), 'public/uploads');
      await fs.mkdir(uploadDir, { recursive: true });

      // Convert to WebP with sharp
      const fileName = `lineup-${lineupId}-${Date.now()}.webp`;
      const filePath = path.join(uploadDir, fileName);
      const buffer = await data.toBuffer();

      await sharp(buffer)
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(filePath);

      const photoUrl = `/public/uploads/${fileName}`;

      // Update lineup with new photo URL
      await (prisma as any).eventLineup.update({
        where: { id: lineupId },
        data: { photoUrl }
      });

      return { url: photoUrl };
    } catch (err: any) {
      console.error('[LINEUP_PHOTO_UPLOAD_ERROR]', err);
      return reply.code(500).send({ error: 'Failed to process image', code: 'PROCESSING_ERROR' });
    }
  });

  // POST /events/:id/ticket-template/upload - Upload ticket template file
  fastify.post('/:id/ticket-template/upload', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const user = req.user as any;

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    let isAuthorized = false;
    if (user.role === 'SUPER_ADMIN') {
      isAuthorized = true;
    } else if (eoProfile && event.eoId === eoProfile.id) {
      isAuthorized = true;
    } else if (user.role === 'EO_STAFF') {
      const staffInvite = await (prisma as any).staffInvite.findFirst({
        where: { email: user.email, eoId: event.eoId, status: 'ACCEPTED' }
      });
      if (staffInvite) isAuthorized = true;
    }
    if (!isAuthorized) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded', code: 'NO_FILE' });

    const mimeType = data.mimetype || '';
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMimeTypes.includes(mimeType)) {
      return reply.code(400).send({
        error: 'Invalid file type. Allowed: PDF, PNG, JPG, WEBP',
        code: 'INVALID_FILE_TYPE'
      });
    }

    try {
      const uploadDir = path.join(process.cwd(), 'public/uploads');
      await fs.mkdir(uploadDir, { recursive: true });

      const extByMime: Record<string, string> = {
        'application/pdf': 'pdf',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      };
      const ext = extByMime[mimeType] || 'bin';
      const fileName = `ticket-template-${id}-${Date.now()}.${ext}`;
      const filePath = path.join(uploadDir, fileName);
      const buffer = await data.toBuffer();

      await fs.writeFile(filePath, buffer);
      return { url: `/public/uploads/${fileName}` };
    } catch (err: any) {
      console.error('[TICKET_TEMPLATE_UPLOAD_ERROR]', err);
      return reply.code(500).send({ error: 'Failed to upload template', code: 'UPLOAD_ERROR' });
    }
  });

  // PATCH /events/:id/lineup/reorder
  fastify.patch('/:id/lineup/reorder', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { orderedIds, dayIndex } = req.body as { orderedIds: string[]; dayIndex?: number };

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    await Promise.all(orderedIds.map((lineupId, index) =>
      (prisma as any).eventLineup.update({
        where: { id: lineupId, eventId: id },
        data: {
          orderIndex: index,
          ...(dayIndex !== undefined ? { dayIndex } : {}),
        },
      })
    ));

    const lineups = await (prisma as any).eventLineup.findMany({
      where: { eventId: id },
      orderBy: [{ dayIndex: 'asc' }, { orderIndex: 'asc' }],
    });
    return { data: lineups };
  });

  // ========== RUNDOWN ROUTES ==========
  fastify.post('/:id/rundown', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    // Ownership Check
    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    try {
      const data = createRundownSchema.parse(req.body);

      // Check for overlaps
      const existing = await (prisma as any).eventRundown.findMany({
        where: {
          eventId: id,
          dayIndex: data.dayIndex,
          stage: data.stage || null,
        },
      });

      const start = new Date(data.startTime);
      const end = data.endTime ? new Date(data.endTime) : null;

      for (const r of existing) {
        const rStart = new Date(r.startTime);
        const rEnd = r.endTime ? new Date(r.endTime) : null;
        if (end && rEnd && !(end <= rStart || start >= rEnd)) {
          return reply.code(400).send({ error: 'Time overlap with existing session', code: 'TIME_OVERLAP' });
        }
        if (!end && !rEnd) {
          // If no end time, assume no overlap or handle differently
        }
      }

      const rundown = await (prisma as any).eventRundown.create({
        data: {
          eventId: id,
          title: data.title,
          startTime: start,
          endTime: end,
          stage: data.stage,
          description: data.description,
          sessionType: data.sessionType,
          dayIndex: data.dayIndex,
          orderIndex: data.orderIndex,
          eventDate: data.eventDate ? new Date(data.eventDate) : null,
        },
      });
      return { data: [rundown] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation error', code: 'VALIDATION_ERROR', details: error.errors });
      }
      console.error('[RUNDOWN_CREATE_ERROR]', error);
      return reply.code(500).send({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  fastify.get('/:slugOrId/rundown', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slugOrId } = req.params as any;
    const event = await (prisma as any).event.findFirst({
      where: { status: 'PUBLISHED', OR: [{ slug: slugOrId }, { id: slugOrId }] },
      select: { id: true },
    });
    if (!event) {
      return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }
    const rundowns = await (prisma as any).eventRundown.findMany({
      where: { eventId: event.id },
      orderBy: [
        { dayIndex: 'asc' },
        { startTime: 'asc' },
        { orderIndex: 'asc' },
      ],
    });
    return { data: rundowns };
  });

  fastify.patch('/rundown/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any; // id is rundownId
    const user = req.user as any;

    const existing = await (prisma as any).eventRundown.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Rundown not found', code: 'RUNDOWN_NOT_FOUND' });

    // Ownership Check
    const event = await (prisma as any).event.findUnique({ where: { id: existing.eventId } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    try {
      const data = updateRundownSchema.parse(req.body);

      // Check for overlaps if time fields are updated
      if (data.startTime || data.endTime || data.dayIndex !== undefined || data.stage !== undefined) {
        const dayIndex = data.dayIndex !== undefined ? data.dayIndex : existing.dayIndex;
        const stage = data.stage !== undefined ? data.stage : existing.stage;
        const start = data.startTime ? new Date(data.startTime) : existing.startTime;
        const end = data.endTime !== undefined ? (data.endTime ? new Date(data.endTime) : null) : existing.endTime;

        const conflicts = await (prisma as any).eventRundown.findMany({
          where: {
            eventId: existing.eventId,
            dayIndex,
            stage: stage || null,
            id: { not: id }, // exclude self
          },
        });

        for (const r of conflicts) {
          const rStart = new Date(r.startTime);
          const rEnd = r.endTime ? new Date(r.endTime) : null;
          if (end && rEnd && !(end <= rStart || start >= rEnd)) {
            return reply.code(400).send({ error: 'Time overlap with existing session', code: 'TIME_OVERLAP' });
          }
        }
      }

      const updateData: any = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
      if (data.endTime !== undefined) updateData.endTime = data.endTime ? new Date(data.endTime) : null;
      if (data.stage !== undefined) updateData.stage = data.stage;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.sessionType !== undefined) updateData.sessionType = data.sessionType;
      if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;
      if (data.dayIndex !== undefined) updateData.dayIndex = data.dayIndex;
      if (data.eventDate !== undefined) updateData.eventDate = data.eventDate ? new Date(data.eventDate) : null;

      const rundown = await (prisma as any).eventRundown.update({
        where: { id },
        data: updateData,
      });
      return { data: [rundown] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation error', code: 'VALIDATION_ERROR', details: error.errors });
      }
      console.error('[RUNDOWN_UPDATE_ERROR]', error);
      return reply.code(500).send({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  fastify.delete('/rundown/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any; // id is rundownId
    const user = req.user as any;

    const existing = await (prisma as any).eventRundown.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Rundown not found', code: 'RUNDOWN_NOT_FOUND' });

    // Ownership Check
    const event = await (prisma as any).event.findUnique({ where: { id: existing.eventId } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    await (prisma as any).eventRundown.delete({ where: { id } });
    return { data: [] };
  });

  // ========== TICKET CATEGORY ROUTES (BATCH UPDATE) ==========
  fastify.put('/:id/ticket-categories', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { categories } = req.body as { categories: any[] };

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    for (const cat of categories) {
      const parsed = ticketCategorySchema.safeParse(cat);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten(),
        });
      }
    }

    const result = await Promise.all(categories.map(async (cat, index) => {
      const baseData = {
        name: cat.name,
        description: cat.description || null,
        price: Number(cat.price),
        quota: Number(cat.quota),
        saleStartAt: cat.saleStartAt ? new Date(cat.saleStartAt) : null,
        saleEndAt: cat.saleEndAt ? new Date(cat.saleEndAt) : null,
        maxPerOrder: Number(cat.maxPerOrder) || 4,
        maxPerAccount: Number(cat.maxPerAccount) || 10,
        templateType: cat.templateType || 'system',
        templateUrl: cat.templateUrl || null,
        isInternal: cat.isInternal || false,
        colorHex: cat.colorHex || null,
        orderIndex: index + 1,
      };

      if (cat.id && !String(cat.id).startsWith('temp-')) {
        // Protected: preserve sold count on update
        const existing = await (prisma as any).ticketCategory.findFirst({ where: { id: cat.id, eventId: id } });
        if (!existing) return reply.code(404).send({ error: `Category ${cat.id} not found`, code: 'CATEGORY_NOT_FOUND' });
        // Prevent reducing quota below sold
        if (baseData.quota < existing.sold) {
          return reply.code(400).send({
            error: `Quota cannot be less than already sold (${existing.sold})`,
            code: 'QUOTA_BELOW_SOLD'
          });
        }
        return (prisma as any).ticketCategory.update({
          where: { id: cat.id },
          data: { ...baseData, sold: existing.sold },
        });
      } else {
        const newCat = await (prisma as any).ticketCategory.create({
          data: { eventId: id, sold: 0, ...baseData },
        });
        await initStock(id, newCat.id, newCat.quota);
        return newCat;
      }
    }));

    return { data: result };
  });

  fastify.post('/:id/ticket-categories', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    if (!['EO_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    const data = ticketCategorySchema.parse(req.body);
    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });

    const categories = await (prisma as any).ticketCategory.findMany({ where: { eventId: id } });
    const orderIndex = categories.length + 1;

    const category = await (prisma as any).ticketCategory.create({
      data: {
        eventId: id,
        name: data.name,
        description: data.description,
        price: data.price,
        quota: data.quota,
        saleStartAt: data.saleStartAt ? new Date(data.saleStartAt) : null,
        saleEndAt: data.saleEndAt ? new Date(data.saleEndAt) : null,
        maxPerOrder: data.maxPerOrder || 4,
        maxPerAccount: data.maxPerAccount || 10,
        templateType: data.templateType || 'system',
        isInternal: data.isInternal || false,
        colorHex: data.colorHex,
        orderIndex,
      },
    });

    await initStock(id, category.id, category.quota);
    return reply.code(201).send(category);
  });

   // GET /events/:slugOrId/tickets (public — internal tickets hidden)
   fastify.get('/:slugOrId/tickets', async (req: FastifyRequest, reply: FastifyReply) => {
     const { slugOrId } = req.params as any;
     const event = await (prisma as any).event.findFirst({
       where: { status: 'PUBLISHED', OR: [{ slug: slugOrId }, { id: slugOrId }] },
       select: {
         id: true,
         categories: {
           where: { isInternal: false },
           orderBy: { orderIndex: 'asc' },
         },
       },
     });
      if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

      const now = new Date();
      const enriched = event.categories.map((cat: any) => {
        let status = 'ACTIVE';
        if (cat.saleStartAt && now < new Date(cat.saleStartAt)) status = 'UPCOMING';
        else if (cat.saleEndAt && now > new Date(cat.saleEndAt)) status = 'CLOSED';
        else if (cat.sold >= cat.quota) status = 'SOLD_OUT';
        return {
          id: cat.id,
          name: cat.name,
          description: cat.description,
          price: cat.price,
          quota: cat.quota,
          sold: cat.sold,
          saleStartAt: cat.saleStartAt,
          saleEndAt: cat.saleEndAt,
          maxPerOrder: cat.maxPerOrder,
          maxPerAccount: cat.maxPerAccount,
          templateType: cat.templateType,
          isInternal: cat.isInternal,
          colorHex: cat.colorHex,
          orderIndex: cat.orderIndex,
          status,
        };
      });

      return { data: enriched };
    });

  fastify.patch('/:id/ticket-categories/:categoryId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, categoryId } = req.params as any;
    const user = req.user as any;
    if (!['EO_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    const body = req.body as any;

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const existing = await (prisma as any).ticketCategory.findFirst({ where: { id: categoryId, eventId: id } });
    if (!existing) return reply.code(404).send({ error: 'Category not found', code: 'CATEGORY_NOT_FOUND' });

    // Protected fields
    delete body.sold;
    delete body.id;
    delete body.eventId;

    // Validate quota >= sold
    if (body.quota !== undefined && Number(body.quota) < existing.sold) {
      return reply.code(400).send({
        error: `Quota cannot be less than already sold (${existing.sold})`,
        code: 'QUOTA_BELOW_SOLD'
      });
    }

    const updateData: any = { ...body };
    if (body.saleStartAt) updateData.saleStartAt = new Date(body.saleStartAt);
    if (body.saleEndAt) updateData.saleEndAt = new Date(body.saleEndAt);
    if (body.price !== undefined) updateData.price = Number(body.price);
    if (body.quota !== undefined) updateData.quota = Number(body.quota);
    if (body.maxPerOrder !== undefined) updateData.maxPerOrder = Number(body.maxPerOrder);
    if (body.maxPerAccount !== undefined) updateData.maxPerAccount = Number(body.maxPerAccount);
    if (body.isInternal !== undefined) updateData.isInternal = body.isInternal;

    const updated = await (prisma as any).ticketCategory.updateMany({
      where: { id: categoryId, eventId: id },
      data: updateData,
    });
    if (updated.count !== 1) {
      return reply.code(404).send({ error: 'Category not found', code: 'CATEGORY_NOT_FOUND' });
    }
    const category = await (prisma as any).ticketCategory.findUnique({ where: { id: categoryId } });
    return { data: category };
  });

  fastify.delete('/:id/ticket-categories/:categoryId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, categoryId } = req.params as any;
    const user = req.user as any;
    if (!['EO_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    
    const category = await (prisma as any).ticketCategory.findUnique({
      where: { id: categoryId },
    });
    
    if (category && category.sold > 0) {
      return reply.code(400).send({ error: 'Cannot delete category with sold tickets', code: 'TICKETS_SOLD' });
    }
    
    const deleted = await (prisma as any).ticketCategory.deleteMany({ where: { id: categoryId, eventId: id } });
    if (deleted.count !== 1) {
      return reply.code(404).send({ error: 'Category not found', code: 'CATEGORY_NOT_FOUND' });
    }
    return { success: true };
  });

  // ========== LEGACY ROUTES (backward compatibility) ==========
  fastify.post('/:id/categories', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { name, price, quota, description } = req.body as any;
    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    
    const category = await (prisma as any).ticketCategory.create({
      data: { name, price, quota, description, eventId: id },
    });

    await initStock(id, category.id, category.quota);
    return category;
  });

   fastify.get('/:id/ticket-categories', async (req: FastifyRequest, reply: FastifyReply) => {
     const { id } = req.params as any;
     const event = await (prisma as any).event.findFirst({
       where: { status: 'PUBLISHED', OR: [{ slug: id }, { id }] },
     });
     if (!event) return reply.code(404).send({ error: 'Event not found' });

     const categories = await (prisma as any).ticketCategory.findMany({
       where: { eventId: event.id, isInternal: false },
        select: {
          id: true,
          name: true,
          price: true,
          quota: true,
          sold: true,
          status: true,
          maxPerOrder: true,
          saleStartAt: true,
          saleEndAt: true,
        },
      });

     const now = new Date();
     return categories.map((cat: any) => {
       const available = cat.quota - cat.sold;
       const dbStatus = String(cat.status || '').toUpperCase();
       let status = 'AVAILABLE';

       // Prioritize terminal statuses from DB first.
       if (dbStatus === 'CLOSED') {
         status = 'CLOSED';
       } else if (dbStatus === 'SOLD_OUT') {
         status = 'SOLD_OUT';
       } else if (cat.saleStartAt && new Date(cat.saleStartAt) > now) {
         status = 'UPCOMING';
       } else if (cat.saleEndAt && new Date(cat.saleEndAt) < now) {
         status = 'CLOSED';
       } else if (available <= 0) {
         status = 'SOLD_OUT';
       } else if (dbStatus === 'DRAFT') {
         // Legacy data may still be DRAFT even after publish; once sale window opens,
         // treat as available so checkout follows saleStartAt/saleEndAt.
         status = 'AVAILABLE';
       }
       return {
         id: cat.id,
         name: cat.name,
         price: cat.price,
         available,
         maxPerOrder: cat.maxPerOrder,
         status,
          saleStartAt: cat.saleStartAt,
       };
     });
   });

  // ========== GENRES & TAGS ==========
  fastify.post('/:id/genres', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { genres } = req.body as { genres: string[] };
    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    
    await (prisma as any).eventGenre.deleteMany({ where: { eventId: id } });
    
    const created = await Promise.all((genres || []).map((genre: string) => 
      (prisma as any).eventGenre.create({ data: { eventId: id, genre } })
    ));
    
    return created;
  });

  fastify.post('/:id/tags', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { tags } = req.body as { tags: string[] };
    const managed = await resolveManagedEvent(id, user);
    if (!managed.event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    
    await (prisma as any).eventTag.deleteMany({ where: { eventId: id } });
    
    const created = await Promise.all((tags || []).map((tag: string) => 
      (prisma as any).eventTag.create({ data: { eventId: id, tag } })
    ));
    
    return created;
  });

  // ========== STATUS TRANSITIONS ==========
  fastify.post('/:id/submit-review', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    const managed = await resolveManagedEvent(id, user);
    const event = managed.event;
    if (!event) return reply.code(404).send({ error: 'Event not found' });
    if (!managed.authorized) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    if (event.status !== 'DRAFT') {
      return reply.code(400).send({ error: 'Only DRAFT events can be submitted for review', code: 'INVALID_STATUS' });
    }

    const errors: string[] = [];
    if (!event.title) errors.push('Title is required');
    if (!event.shortDescription) errors.push('Short description is required');
    if (!event.posterUrl) errors.push('Poster is required');
    if (new Date(event.startDate) <= new Date()) errors.push('Event date must be in the future');

    const venue = await (prisma as any).eventVenue.findUnique({ where: { eventId: id } });
    if (!venue) errors.push('Venue is required');

    const lineups = await (prisma as any).eventLineup.findMany({ where: { eventId: id } });
    if (lineups.length === 0) errors.push('At least 1 lineup is required');

    const rundowns = await (prisma as any).eventRundown.findMany({ where: { eventId: id } });
    if (rundowns.length === 0) errors.push('At least 1 rundown is required');

    const categories = await (prisma as any).ticketCategory.findMany({ where: { eventId: id, isInternal: false } });
    if (categories.length === 0) errors.push('At least 1 public ticket category is required');

    if (errors.length > 0) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors });
    }

    await (prisma as any).event.update({
      where: { id },
      data: { status: 'REVIEW' },
    });

    const actor = req.user as any;
    await (prisma as any).eventComment.create({
      data: {
        eventId: id,
        authorId: actor.id,
        authorRole: actor.role,
        message: 'Event diajukan untuk review. Mohon persetujuan admin.',
      },
    }).catch(() => null);

    const admins = await (prisma as any).user.findMany({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    await createNotifications(admins.map((a: any) => a.id), {
      type: 'EVENT_SUBMITTED_REVIEW',
      title: `Event diajukan: ${event.title || id}`,
      body: 'EO mengajukan event untuk review dan persetujuan.',
      data: { eventId: id },
    });

    return { status: 'REVIEW', message: 'Event submitted for review' };
  });

  fastify.post('/:id/cancel', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    if (!['EO_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    const { reason } = req.body as { reason?: string };

    const managed = await resolveManagedEvent(id, user);
    const event = managed.event;
    if (!event) return reply.code(404).send({ error: 'Event not found' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    if (event.status === 'COMPLETED' || event.status === 'ARCHIVED') {
      return reply.code(400).send({ error: 'Cannot cancel this event', code: 'INVALID_STATUS' });
    }

    await (prisma as any).event.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason },
    });

    await (prisma as any).ticketCategory.updateMany({
      where: { eventId: id },
      data: { status: 'CLOSED' },
    });
    await logSuperAdminAction(user, 'EVENT_CANCELLED_BY_SUPER_ADMIN', id, req.ip, { reason: reason || null });

    return { success: true, message: 'Event cancelled' };
  });

  fastify.post('/:id/archive', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    if (!['EO_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const managed = await resolveManagedEvent(id, user);
    const event = managed.event;
    if (!event) return reply.code(404).send({ error: 'Event not found' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });

    await (prisma as any).event.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    await logSuperAdminAction(user, 'EVENT_ARCHIVED_BY_SUPER_ADMIN', id, req.ip);

    return { success: true, message: 'Event archived' };
  });

  fastify.post('/:id/publish', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    if (!['EO_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    const managed = await resolveManagedEvent(id, user);
    const event = managed.event;
    if (!event) return reply.code(404).send({ error: 'Event not found' });
    if (!managed.authorized) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    if (event.status !== 'REVIEW' && user.role !== 'SUPER_ADMIN') {
      return reply.code(400).send({ error: 'Event must be in REVIEW status', code: 'INVALID_STATUS' });
    }
    if (!event.title || !event.description || String(event.description).trim().length === 0) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: ['Title and description are required'] });
    }
    if (new Date(event.endDate) <= new Date(event.startDate)) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: ['Invalid date range'] });
    }

    const [venue, categories] = await Promise.all([
      (prisma as any).eventVenue.findUnique({ where: { eventId: id }, select: { id: true } }),
      (prisma as any).ticketCategory.findMany({ where: { eventId: id }, select: { id: true, quota: true, isInternal: true } }),
    ]);

    const publishErrors: string[] = [];
    if (!venue) publishErrors.push('Venue is required');
    if (categories.length === 0) publishErrors.push('At least 1 ticket category is required');
    if (!categories.some((c: any) => !c.isInternal && c.quota > 0)) publishErrors.push('At least 1 public ticket with stock > 0 is required');
    if (publishErrors.length > 0) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: publishErrors });
    }

    const publishResult = await (prisma as any).$transaction(async (tx: any) => {
      const updatedEvent = await tx.event.updateMany({
        where: { id, status: 'REVIEW' },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      if (!updatedEvent || updatedEvent.count !== 1) {
        return { updated: false };
      }
      await tx.ticketCategory.updateMany({
        where: { eventId: id },
        data: { status: 'ACTIVE' },
      });
      return { updated: true };
    });

    if (!publishResult.updated) {
      return reply.code(400).send({ error: 'Event must be in REVIEW status', code: 'INVALID_STATUS' });
    }

    for (const cat of categories) {
      await initStock(id, cat.id, cat.quota);
    }
    await logSuperAdminAction(user, 'EVENT_PUBLISHED_BY_SUPER_ADMIN', id, req.ip, { categoryCount: categories.length });

    return { success: true, status: 'PUBLISHED' };
  });

   fastify.get('/:slugOrId/ticket-availability', async (req: FastifyRequest, reply: FastifyReply) => {
     const { slugOrId } = req.params as any;
     
     const event = await (prisma as any).event.findFirst({
       where: { status: 'PUBLISHED', OR: [{ slug: slugOrId }, { id: slugOrId }] },
       select: { 
         id: true,
         status: true,
         categories: { 
           select: { id: true, name: true, quota: true, sold: true, saleStartAt: true, saleEndAt: true }
         }
       },
     });

     if (!event) return reply.code(404).send({ error: 'Event not found' });

     const now = new Date();
     const categories = (event.categories || []).map((cat: any) => {
       const available = cat.quota - cat.sold;
       let status = 'AVAILABLE';
       
       if (cat.saleStartAt && new Date(cat.saleStartAt) > now) {
         status = 'NOT_YET';
       } else if (cat.saleEndAt && new Date(cat.saleEndAt) < now) {
         status = 'CLOSED';
       } else if (available <= 0) {
         status = 'SOLD_OUT';
       } else if (available < 50) {
         status = 'LOW_STOCK';
       }

       return {
         id: cat.id,
         name: cat.name,
         available,
         sold: cat.sold,
         status,
       };
     });

     return { categories };
   });

   // ========== GET CATEGORY BY ID ==========
  fastify.get('/categories/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const category = await (prisma as any).ticketCategory.findUnique({
      where: { id },
      include: { event: { select: { id: true, title: true, slug: true, startDate: true, endDate: true, city: true, venues: { select: { name: true } } } } },
    });
    if (!category) return reply.code(404).send({ error: 'Category not found' });

    const now = new Date();
    const available = category.quota - category.sold;
    let status = 'AVAILABLE';
    if (category.saleStartAt && now < new Date(category.saleStartAt)) status = 'UPCOMING';
    else if (category.saleEndAt && now > new Date(category.saleEndAt)) status = 'CLOSED';
    else if (available <= 0) status = 'SOLD_OUT';

    return {
      id: category.id,
      name: category.name,
      price: category.price,
      quota: category.quota,
      sold: category.sold,
      available,
      maxPerOrder: 10,
      description: category.description,
      eventId: category.eventId,
      status,
      event: category.event,
    };
  });
}
