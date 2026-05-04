import dotenv from 'dotenv';
// Load .env and override any existing env vars to ensure .env takes precedence
dotenv.config({ override: true });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { connectRedis } from './services/redis.js';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { adminUserRoutes } from './routes/admin.js';
import { eventRoutes } from './routes/events.js';
import { orderRoutes } from './routes/orders.js';
import { ticketRoutes } from './routes/tickets/index.js';
import { ticketRoutes as legacyTicketRoutes } from './routes/tickets.js';
import { rfidRoutes } from './routes/rfid.js';
import { gamiRoutes } from './routes/gamification.js';
import { lotteryRoutes } from './routes/lottery.js';
import { prizeRoutes } from './routes/prizes.js';
import { eoRoutes } from './routes/eo.js';
import { eoTicketRoutes } from './routes/eo-tickets.js';
import { settingsRoutes } from './routes/settings.js';
import { checkinRoutes } from './routes/checkin.js';
import { notificationRoutes } from './routes/notifications.js';
import { paymentRoutes } from './routes/payments.js';
import { createTicketGenerateWorker, createTicketWaWorker, createTicketResendWorker, createOrderExpireWorker } from './workers/index.js';

export const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'production' ? { level: 'warn' } : true,
    bodyLimit: 52428800, // 50MB
  });

  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Disable CSP for easier development, or configure specifically
  });
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : true,
    credentials: true
  });

   await app.register(multipart);
   await app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/',
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX_REQUESTS || 100,
    timeWindow: env.RATE_LIMIT_WINDOW_MS || 60000,
    allowList: ['127.0.0.1'],
    errorResponseBuilder: (req, context) => ({
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      expiresIn: Math.ceil(Number(context.after) / 1000)
    })
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation Error',
        code: 'VALIDATION_ERROR',
        details: error.errors.map(err => ({
          path: err.path,
          message: err.message
        }))
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
        code: (error as any).code
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      code: 'INTERNAL_SERVER_ERROR'
    });
  });

  await connectRedis();

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(adminUserRoutes, { prefix: '/api/admin' });
  await app.register(eventRoutes, { prefix: '/api/events' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(ticketRoutes, { prefix: '/api/tickets' });
  await app.register(legacyTicketRoutes, { prefix: '/api/tickets' });
  await app.register(rfidRoutes, { prefix: '/api/rfid' });
  await app.register(gamiRoutes, { prefix: '/api/gami' });
  await app.register(lotteryRoutes, { prefix: '/api/lottery' });
  await app.register(prizeRoutes, { prefix: '/api/prizes' });
  await app.register(eoRoutes, { prefix: '/api/eo' });
  await app.register(eoTicketRoutes, { prefix: '/api/eo' });
  await app.register(checkinRoutes, { prefix: '/api/checkin' });
  await app.register(settingsRoutes, { prefix: '/api/admin/settings' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });

  // Start background workers after app is ready
  try {
    createTicketGenerateWorker();
    createTicketWaWorker();
    createTicketResendWorker();
    createOrderExpireWorker();
    console.log('Background workers started');
  } catch (workerError) {
    console.error('Failed to start some workers:', workerError);
    // Non-fatal - continue without workers
  }

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV
  }));

  return app;
}
