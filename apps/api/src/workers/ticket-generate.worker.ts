import { Worker } from 'bullmq';
import { redis } from '../services/redis.js';
import { encryptQrPayload, generateQrImage, signPayload } from '../lib/qr.js';
import { generateDefaultPdf } from '../lib/pdf-default.js';
import { generateCustomPdf } from '../lib/pdf-custom.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  throw new Error('R2 upload not implemented');
}

async function processor(job: { data: { orderId: string } }) {
  const { orderId } = job.data;
  
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tickets: { where: { status: 'PENDING' } },
      event: { include: { eo: true, venues: true } },
      items: { include: { category: true } }
    }
  });

  if (!order) {
    console.log(`Order ${orderId} not found, skipping`);
    return;
  }

  if (order.status !== 'PAID') {
    console.log(`Order ${orderId} status is ${order.status}, skipping ticket generation`);
    return;
  }

  const category = order.items[0]?.category;
  if (!category) {
    console.log(`No category found for order ${orderId}, skipping`);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const ticket of order.tickets) {
    try {
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
          qrImageUrl,
          pdfUrl,
          status: 'ACTIVE',
          generatedAt: new Date()
        }
      });

      successCount++;
    } catch (error) {
      failCount++;
      console.error(`Failed to generate ticket ${ticket.id}:`, error instanceof Error ? error.message : String(error));
    }
  }

  if (successCount > 0) {
    if (failCount === 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'FULFILLED',
          fulfilledAt: new Date()
        }
      });

      await prisma.ticketCategory.update({
        where: { id: category.id },
        data: { sold: { increment: successCount } }
      });
    } else {
      console.warn(`Order ${orderId} partially fulfilled: ${successCount} success, ${failCount} failed`);
    }
  }

  if (failCount > 0 && successCount === 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' }
    });
    console.error(`ALERT: All tickets failed for order ${orderId}`);
  }

  console.log(`Tickets generated for order ${orderId}, count: ${successCount}`);
}

export function createTicketGenerateWorker() {
  const worker = new Worker('ticket:generate', processor, {
    connection: redis,
    concurrency: 5
  });

  worker.on('failed', (job, err) => {
    console.error('ticket:generate failed:', { jobId: job?.id, error: err.message });
  });

  console.log('Ticket generate worker started');

  return worker;
}