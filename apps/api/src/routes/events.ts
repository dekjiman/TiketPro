import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import sharp from 'sharp';
import { authenticate } from './auth.js';
import { initStock } from '../services/redis.js';

const prisma = new PrismaClient();

const eventSchema = z.object({
  title: z.string().min(3),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  city: z.string(),
  province: z.string().optional(),
  posterUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

const updateEventSchema = eventSchema.partial();

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
  quota: z.number().int().min(0),
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

export async function eventRoutes(fastify: FastifyInstance) {
  // ========== IMAGE UPLOAD (REWORKED) ==========
  fastify.post('/:id/upload/:type', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const { id, type } = req.params as { id: string, type: 'poster' | 'banner' };

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

    const fileName = `${id}-${type}-${Date.now()}.webp`;
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    const filePath = path.join(uploadDir, fileName);

    // Process image with Sharp
    const buffer = await data.toBuffer();
    const sharpInstance = sharp(buffer);
    
    if (type === 'poster') {
      await sharpInstance.resize(800, 800, { fit: 'cover' }).webp().toFile(filePath);
      await (prisma as any).event.update({ where: { id }, data: { posterUrl: `/public/uploads/${fileName}` } });
    } else {
      await sharpInstance.resize(1200, 630, { fit: 'cover' }).webp().toFile(filePath);
      await (prisma as any).event.update({ where: { id }, data: { bannerUrl: `/public/uploads/${fileName}` } });
    }

    return { url: `/public/uploads/${fileName}` };
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
                categories: true,
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

  // ========== LIST EVENTS ==========
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { city, status, search, page, limit } = req.query as any;
    const where: any = {};
    
    if (city) where.city = city;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      (prisma as any).event.findMany({
        where,
        include: { eo: { include: { user: { select: { name: true } } } }, categories: true },
        orderBy: { startDate: 'asc' },
        skip,
        take: limitNum,
      }),
      (prisma as any).event.count({ where }),
    ]);
    return {
      data: events,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  });


  // ========== GET EVENT DETAIL (PUBLIC) ==========
  fastify.get('/:slugOrId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slugOrId } = req.params as any;
    try {
      const event = await (prisma as any).event.findFirst({
        where: {
          OR: [{ slug: slugOrId }, { id: slugOrId }]
        },
        include: {
          eo: { select: { id: true, companyName: true, user: { select: { name: true } } } },
          venues: true,
          categories: {
            where: { isInternal: false },
            orderBy: { orderIndex: 'asc' }
          },
          lineups: { orderBy: [{ dayIndex: 'asc' }, { orderIndex: 'asc' }] },
          rundowns: { orderBy: [{ dayIndex: 'asc' }, { startTime: 'asc' }] },
        }
      });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      // Enrich categories with status
      const now = new Date();
      const enrichedCategories = (event.categories || []).map((cat: any) => {
        let status = 'AVAILABLE';
        if (cat.saleStartAt && now < new Date(cat.saleStartAt)) status = 'UPCOMING';
        else if (cat.saleEndAt && now > new Date(cat.saleEndAt)) status = 'CLOSED';
        else if (cat.sold >= cat.quota) status = 'SOLD_OUT';
        return { ...cat, status };
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
       

  // ========== CREATE EVENT ==========
  fastify.post('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!['SUPER_ADMIN', 'EO_ADMIN'].includes(user.role)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const data = eventSchema.parse(req.body);
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
    let slug = baseSlug;
    const existing = await (prisma as any).event.findUnique({ where: { slug } });
    if (existing) {
      slug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
    }

    const event = await (prisma as any).event.create({
      data: {
        title: data.title,
        shortDescription: data.shortDescription || '',
        description: data.description || '',
        slug,
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
      },
    });

    return reply.code(201).send(event);
  });

   // ========== UPDATE EVENT ==========
   fastify.patch('/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;

     // Check if the event exists and user has permission
     const event = await (prisma as any).event.findUnique({ where: { id } });
     if (!event) {
       return reply.code(404).send({ error: 'Event not found' });
     }

     // Only EO owner, EO Staff, or SUPER_ADMIN can update
     const isSuperAdmin = userRole === 'SUPER_ADMIN';
     let isAuthorized = false;

     if (isSuperAdmin) {
       isAuthorized = true;
     } else {
       // Check if user is the EO_ADMIN (owner)
       const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId } });
       if (eoProfile && event.eoId === eoProfile.id) {
         isAuthorized = true;
       } else if (userRole === 'EO_STAFF') {
         const user = await (prisma as any).user.findUnique({ where: { id: userId } });
         const staffInvite = await (prisma as any).staffInvite.findFirst({
           where: { email: user.email, eoId: event.eoId, status: 'ACCEPTED' }
         });
         if (staffInvite) isAuthorized = true;
       }
     }

     if (!isAuthorized) {
       return reply.code(403).send({ error: 'Unauthorized', message: 'You do not have permission to edit this event' });
     }

     const data = updateEventSchema.parse(req.body);
     const updateData: any = { ...data };
     
     if (data.startDate) updateData.startDate = new Date(data.startDate);
     if (data.endDate) updateData.endDate = new Date(data.endDate);

     // Re-compute isMultiDay if any date is changed
     if (data.startDate || data.endDate) {
       const start = updateData.startDate || new Date(event.startDate);
       const end = updateData.endDate || new Date(event.endDate);
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
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
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
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
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
        const existing = await (prisma as any).ticketCategory.findUnique({ where: { id: cat.id } });
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
    const data = ticketCategorySchema.parse(req.body);

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
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
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
      let status = 'AVAILABLE';
      if (cat.saleStartAt && now < new Date(cat.saleStartAt)) status = 'UPCOMING';
      else if (cat.saleEndAt && now > new Date(cat.saleEndAt)) status = 'CLOSED';
      else if (cat.sold >= cat.quota) status = 'SOLD_OUT';
      return { ...cat, status };
    });

    return { data: enriched };
  });

  fastify.patch('/:id/ticket-categories/:categoryId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, categoryId } = req.params as any;
    const user = req.user as any;
    const body = req.body as any;

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const eoProfile = await (prisma as any).eoProfile.findUnique({ where: { userId: user.id } });
    if (!eoProfile || (event.eoId !== eoProfile.id && user.role !== 'SUPER_ADMIN')) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const existing = await (prisma as any).ticketCategory.findUnique({ where: { id: categoryId } });
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

    const category = await (prisma as any).ticketCategory.update({
      where: { id: categoryId },
      data: updateData,
    });
    return { data: category };
  });

  fastify.delete('/:id/ticket-categories/:categoryId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, categoryId } = req.params as any;
    
    const category = await (prisma as any).ticketCategory.findUnique({
      where: { id: categoryId },
    });
    
    if (category && category.sold > 0) {
      return reply.code(400).send({ error: 'Cannot delete category with sold tickets', code: 'TICKETS_SOLD' });
    }
    
    await (prisma as any).ticketCategory.delete({ where: { id: categoryId, eventId: id } });
    return { success: true };
  });

  // ========== LEGACY ROUTES (backward compatibility) ==========
  fastify.post('/:id/categories', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const { name, price, quota, description } = req.body as any;
    
    const category = await (prisma as any).ticketCategory.create({
      data: { name, price, quota, description, eventId: id },
    });

    await initStock(id, category.id, category.quota);
    return category;
  });

  fastify.get('/:id/ticket-categories', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const categories = await (prisma as any).ticketCategory.findMany({
      where: { eventId: id },
      select: { id: true, name: true, price: true, quota: true, sold: true },
    });
    return categories;
  });

  // ========== GENRES & TAGS ==========
  fastify.post('/:id/genres', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const { genres } = req.body as { genres: string[] };
    
    await (prisma as any).eventGenre.deleteMany({ where: { eventId: id } });
    
    const created = await Promise.all((genres || []).map((genre: string) => 
      (prisma as any).eventGenre.create({ data: { eventId: id, genre } })
    ));
    
    return created;
  });

  fastify.post('/:id/tags', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const { tags } = req.body as { tags: string[] };
    
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

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });
    if (event.eoId !== user.id && user.role !== 'SUPER_ADMIN') {
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

    return { status: 'REVIEW', message: 'Event submitted for review' };
  });

  fastify.post('/:id/cancel', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;
    const { reason } = req.body as { reason?: string };

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });
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

    return { success: true, message: 'Event cancelled' };
  });

  fastify.post('/:id/archive', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    await (prisma as any).event.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return { success: true, message: 'Event archived' };
  });

  fastify.post('/:id/publish', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const user = req.user as any;

    const event = await (prisma as any).event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });
    if (event.status !== 'REVIEW' && user.role !== 'SUPER_ADMIN') {
      return reply.code(400).send({ error: 'Event must be in REVIEW status', code: 'INVALID_STATUS' });
    }

    const categories = await (prisma as any).ticketCategory.findMany({ where: { eventId: id } });
    for (const cat of categories) {
      await initStock(id, cat.id, cat.quota);
    }

    await (prisma as any).event.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    await (prisma as any).ticketCategory.updateMany({
      where: { eventId: id },
      data: { status: 'ACTIVE' },
    });

    return { success: true, status: 'PUBLISHED' };
  });

  fastify.get('/:slugOrId/ticket-availability', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slugOrId } = req.params as any;
    
    const event = await (prisma as any).event.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
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

  // ========== GET TICKET CATEGORIES FOR CHECKOUT ==========
  fastify.get('/:slugOrId/ticket-categories', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slugOrId } = req.params as any;

    const event = await (prisma as any).event.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
      select: {
        id: true,
        status: true,
        categories: {
          select: {
            id: true,
            name: true,
            price: true,
            quota: true,
            sold: true,
            maxPerOrder: true,
            saleStartAt: true,
            saleEndAt: true
          }
        }
      },
    });

    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const now = new Date();
    const categories = (event.categories || []).map((cat: any) => {
      const available = cat.quota - cat.sold;
      let status = 'AVAILABLE';

      if (cat.saleStartAt && new Date(cat.saleStartAt) > now) {
        status = 'UPCOMING';
      } else if (cat.saleEndAt && new Date(cat.saleEndAt) < now) {
        status = 'CLOSED';
      } else if (available <= 0) {
        status = 'SOLD_OUT';
      }

      return {
        id: cat.id,
        name: cat.name,
        price: cat.price,
        available,
        maxPerOrder: cat.maxPerOrder,
        status,
      };
    });

    return categories;
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