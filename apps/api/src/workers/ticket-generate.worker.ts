import { Worker } from 'bullmq';
import { redis, Queues, createQueue, atomicIncrStock } from '../services/redis.js';
import { encryptQrPayload, generateQrImage, signPayload } from '../lib/qr.js';
import { generateDefaultPdf } from '../lib/pdf-default.js';
import { generateCustomPdf } from '../lib/pdf-custom.js';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

const prisma = new PrismaClient();

// Initialize S3/R2 client if credentials are configured
let s3: S3Client | null = null;
if (env.CLOUDFLARE_R2_ACCESS_KEY && env.CLOUDFLARE_R2_SECRET_KEY) {
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY,
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_KEY,
    },
  });
  console.log('[R2] S3 client initialized');
} else {
  console.warn('[R2] Credentials not configured, file uploads will be skipped');
}

const BUCKET = env.CLOUDFLARE_R2_BUCKET || 'tickets';

async function emitWorkerAlert(event: string, payload: Record<string, unknown>) {
  const alertPayload = {
    source: 'ticket-generate-worker',
    event,
    payload,
    occurredAt: new Date().toISOString(),
  };

  console.error('[WorkerAlert]', alertPayload);

  try {
    const emailQueue = createQueue(Queues.EMAIL_SEND);
    await emailQueue.add('worker-alert', alertPayload);
  } catch (err) {
    console.error('[WorkerAlert] Failed to enqueue alert:', err);
  }
}

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (!s3) {
    // Save locally when R2 is not configured
    const fs = await import('fs');
    const path = await import('path');

    const cwd = process.cwd();
    let publicDir = '';
    
    if (cwd.endsWith(path.join('apps', 'api'))) {
      publicDir = path.join(cwd, 'public');
    } else if (cwd.includes(path.join('apps', 'api'))) {
      // We are deeper in apps/api, find its root
      const parts = cwd.split(path.sep);
      const apiIndex = parts.indexOf('api');
      publicDir = path.join(parts.slice(0, apiIndex + 1).join(path.sep), 'public');
    } else {
      // Assume root
      publicDir = path.join(cwd, 'apps', 'api', 'public');
    }

    const filePath = path.join(publicDir, key);

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(filePath))) {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    }

    // Save file
    await fs.promises.writeFile(filePath, buffer);
    console.log('[LOCAL] Saved file:', filePath);

    return `http://localhost:4000/public/${key}`;
  }

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    
    let baseUrl = env.CLOUDFLARE_R2_PUBLIC_URL;
    if (!baseUrl && env.CLOUDFLARE_R2_ACCOUNT_ID) {
      baseUrl = `https://${BUCKET}.${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    }
    const url = baseUrl ? `${baseUrl}/${key}` : `local://${key}`;
    console.log(`[R2] Uploaded: ${key} -> ${url}`);
    return url;
  } catch (error) {
    console.error(`[R2] Upload failed for ${key}:`, error);
    throw error;
  }
}

async function processor(job: { data: { orderId: string }; attemptsMade?: number }) {
  const { orderId } = job.data;
  const maxRetries = 2;
  const attemptsMade = job.attemptsMade || 0;

  if (attemptsMade >= maxRetries) {
    console.log(`[TicketGenerate] Order ${orderId} exceeded ${maxRetries} retries, skipping`);
    return;
  }
  
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tickets: {
        where: {
          OR: [
            { status: 'PENDING' },
            { status: 'ACTIVE', pdfUrl: null }
          ]
        }
      },
      event: { include: { eo: true, venues: true } },
      items: { include: { category: true } }
    }
  });

  if (!order) {
    console.log(`Order ${orderId} not found, skipping`);
    return;
  }

  console.log(`[TicketGenerate] Found ${order.tickets.length} ticket(s) to generate/regenerate for order ${orderId}`);

  if (order.status !== 'PAID' && order.status !== 'FULFILLED') {
    console.log(`Order ${orderId} status is ${order.status}, skipping ticket generation/regeneration`);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const ticket of order.tickets) {
    try {
      // Skip if ticket already generated and active
      if (ticket.status === 'ACTIVE' && ticket.pdfUrl) {
        console.log(`[TicketGenerate] Ticket ${ticket.id} already generated, skipping`);
        successCount++;
        continue;
      }
      // Find the correct category for this specific ticket
      const item = order.items.find(i => i.categoryId === ticket.categoryId);
      const category = item?.category;
      
      if (!category) {
        console.warn(`[TicketGenerate] No category found for ticket ${ticket.id} (categoryId: ${ticket.categoryId}), skipping`);
        failCount++;
        continue;
      }

      const rawPayload = {
        tid: ticket.id,
        eid: order.eventId,
        cid: ticket.categoryId,
        uid: ticket.userId,
        hn: ticket.holderName,
        iat: Math.floor(Date.now() / 1000),
        sig: ''
      };
      rawPayload.sig = signPayload(rawPayload);
      const qrEncrypted = encryptQrPayload(rawPayload);
      const qrBuffer = await generateQrImage(qrEncrypted);
      const qrImageUrl = await uploadToR2(`qr/${ticket.id}.png`, qrBuffer, 'image/png');

      const pdfBuffer = category.templateType === 'custom' && category.templateUrl
        ? await generateCustomPdf(
            {
              id: ticket.id,
              ticketCode: ticket.ticketCode,
              holderName: ticket.holderName,
              holderEmail: ticket.holderEmail || undefined,
              isInternal: ticket.isInternal,
              category: { name: category.name, colorHex: category.colorHex || undefined },
              orderId: order.id,
              order: {
                id: order.id,
                event: {
                  title: order.event.title,
                  startDate: order.event.startDate,
                  endDate: order.event.endDate,
                  city: order.event.city,
                  venue: order.event.venues?.[0] ? {
                    name: order.event.venues[0].name,
                    address: order.event.venues[0].address
                  } : undefined
                },
                eo: { companyName: order.event.eo?.companyName || 'EO' }
              }
            },
            {
              id: order.id,
              event: {
                title: order.event.title,
                startDate: order.event.startDate,
                endDate: order.event.endDate,
                city: order.event.city,
                venue: order.event.venues?.[0] ? {
                  name: order.event.venues[0].name,
                  address: order.event.venues[0].address
                } : undefined
              },
              eo: { companyName: order.event.eo?.companyName || 'EO' }
            },
            qrBuffer
          )
        : await generateDefaultPdf(
            {
              id: ticket.id,
              ticketCode: ticket.ticketCode,
              holderName: ticket.holderName,
              holderEmail: ticket.holderEmail || undefined,
              isInternal: ticket.isInternal,
              category: { name: category.name, colorHex: category.colorHex || undefined },
              orderId: order.id,
              order: {
                id: order.id,
                event: {
                  title: order.event.title,
                  startDate: order.event.startDate,
                  endDate: order.event.endDate,
                  city: order.event.city,
                  venue: order.event.venues?.[0] ? {
                    name: order.event.venues[0].name,
                    address: order.event.venues[0].address
                  } : undefined
                },
                eo: { companyName: order.event.eo?.companyName || 'EO' }
              }
            },
            {
              id: order.id,
              event: {
                title: order.event.title,
                startDate: order.event.startDate,
                endDate: order.event.endDate,
                city: order.event.city,
                venue: order.event.venues?.[0] ? {
                  name: order.event.venues[0].name,
                  address: order.event.venues[0].address
                } : undefined
              },
              eo: { companyName: order.event.eo?.companyName || 'EO' }
            },
            qrBuffer
          );

      const pdfUrl = await uploadToR2(`tickets/${ticket.id}.pdf`, pdfBuffer, 'application/pdf');

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          qrEncrypted,
          qrImageUrl,
          pdfUrl,
          status: 'ACTIVE',
          generatedAt: new Date()
        }
      });

      // Enqueue WA notification for successful ticket generation
      try {
        const waQueue = createQueue(Queues.TICKET_WA);
        await waQueue.add('send', { ticketId: ticket.id });
        console.log(`[TicketGenerate] Enqueued WA notification for ticket ${ticket.id}`);
      } catch (waError) {
        console.error(`[TicketGenerate] Failed to enqueue WA for ticket ${ticket.id}:`, waError);
        await emitWorkerAlert('wa_enqueue_failed', {
          orderId,
          ticketId: ticket.id,
          error: waError instanceof Error ? waError.message : String(waError),
        });
      }

      successCount++;
    } catch (error) {
      failCount++;
      console.error(`[TicketGenerate] Failed to generate ticket ${ticket.id} (attempt ${attemptsMade + 1}/${maxRetries + 1}):`, error instanceof Error ? error.message : String(error));

      // Only cancel ticket if we've exhausted all retries
      if (attemptsMade >= maxRetries) {
        try {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: 'CANCELLED' }
          });
          console.log(`[TicketGenerate] Cancelled ticket ${ticket.id} after ${maxRetries + 1} failed attempts`);
        } catch (updateErr) {
          console.error(`[TicketGenerate] Failed to cancel ticket ${ticket.id}:`, updateErr);
          await emitWorkerAlert('ticket_cancel_failed_after_retries', {
            orderId,
            ticketId: ticket.id,
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          });
        }
      } else {
        console.log(`[TicketGenerate] Will retry ticket ${ticket.id} (attempt ${attemptsMade + 2}/${maxRetries + 1})`);
      }
    }
  }

  if (successCount > 0) {
    if (failCount === 0 && order.status === 'PAID') {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'FULFILLED',
          fulfilledAt: new Date()
        }
      });
      console.log(`Order ${orderId} fulfilled with all ${successCount} tickets`);
    } else {
      console.warn(`Order ${orderId} partially fulfilled: ${successCount} success, ${failCount} failed`);
    }
  }

  if (failCount > 0 && successCount === 0 && order.status === 'PAID') {
    let transitioned = false;
    await prisma.$transaction(async (tx) => {
      const transition = await tx.order.updateMany({
        where: { id: orderId, status: 'PAID' },
        data: { status: 'CANCELLED' }
      });
      transitioned = transition.count === 1;
      if (!transitioned) return;

      for (const item of order.items) {
        await tx.ticketCategory.updateMany({
          where: { id: item.categoryId, sold: { gte: item.quantity } },
          data: { sold: { decrement: item.quantity } },
        });
      }
      await tx.ticket.updateMany({
        where: { orderId, status: { in: ['PENDING', 'CANCELLED'] } as any },
        data: { status: 'CANCELLED' }
      });
    });

    if (transitioned) {
      for (const item of order.items) {
        await atomicIncrStock(order.eventId, item.categoryId, item.quantity);
      }
    }
    console.error(`ALERT: All tickets failed for order ${orderId}`);
    await emitWorkerAlert('all_tickets_generation_failed', {
      orderId,
      successCount,
      failCount,
      attemptsMade,
    });
  }

  console.log(`Tickets generated for order ${orderId}, success: ${successCount}, fail: ${failCount}`);
}

export function createTicketGenerateWorker() {
  const worker = new Worker(Queues.TICKET_GENERATE, processor, {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 10,
      duration: 1000
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 }
  });

  worker.on('failed', (job, err) => {
    console.error('ticket:generate failed:', { jobId: job?.id, error: err.message, attemptsMade: job?.attemptsMade });
    void emitWorkerAlert('worker_job_failed', {
      jobId: job?.id,
      orderId: job?.data?.orderId,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on('completed', (job) => {
    console.log(`ticket:generate completed for order ${job?.data?.orderId}`);
  });

  console.log('Ticket generate worker started');

  return worker;
}
