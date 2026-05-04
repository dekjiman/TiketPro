import { Worker } from 'bullmq';
import { redis, Queues } from '../services/redis.js';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const prisma = new PrismaClient();
const FONNTE_BASE_URL = 'https://api.fonnte.com';

async function sendWaMessage(target: string, message: string, fileUrl?: string): Promise<boolean> {
  const token = env.FONNTE_API_KEY;
  if (!token) {
    console.warn('Fonnte API key not configured');
    return false;
  }

  const phone = formatPhone(target);
  if (!phone) {
    console.warn(`Invalid phone number: ${target}`);
    return false;
  }

  const body: Record<string, string> = {
    target: phone,
    message
  };
  if (fileUrl) {
    body.file = fileUrl;
  }

  try {
    const response = await fetch(`${FONNTE_BASE_URL}/send`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fonnte API error:', response.status, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Fonnte request failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

function formatPhone(phone: string): string | null {
  if (!phone) return null;
  
  const cleaned = phone.replace(/[\s-]/g, '');
  
  if (/^0\d{8,}$/.test(cleaned)) {
    return '+62' + cleaned.substring(1);
  }
  if (/^62\d{8,}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  if (/^\+62\d{8,}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^62\d{8,}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  
  return null;
}

function formatEventDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function buildTicketMessage(data: {
  holderName: string;
  eventTitle: string;
  eventDate: Date;
  venueName?: string;
  city: string;
  categoryName: string;
  ticketCode: string;
  pdfUrl: string;
}): string {
  const lines = [
    '🎟️ Tiket Anda Siap!',
    '',
    `Halo ${data.holderName}! 👋`,
    '',
    data.eventTitle,
    `🗓️ ${formatEventDate(data.eventDate)}`,
    `📍 ${data.venueName || 'Tempat Belum Ditentukan'}, ${data.city}`,
    `🎫 ${data.categoryName}`,
    `👤 ${data.holderName}`,
    `🔢 ${data.ticketCode}`,
    '',
    `Download tiket: ${data.pdfUrl}`,
    '',
    'Jangan berikan QR code kepada orang lain.',
    'Sampai jumpa di venue! 🎉'
  ];
  
  return lines.join('\n');
}

async function processor(job: { data: { orderId: string }; attemptsMade?: number }) {
  const { orderId } = job.data;
  const maxRetries = 2;
  const attemptsMade = job.attemptsMade || 0;
  
  if (attemptsMade >= maxRetries) {
    console.log(`WA job ${orderId} exceeded ${maxRetries} retries, skipping`);
    return;
  }
  
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tickets: { where: { status: 'ACTIVE' }, include: { category: true } },
      event: { include: { venues: true } },
      user: { select: { phone: true } }
    }
  });

  if (!order) {
    console.log(`Order ${orderId} not found for WA worker`);
    return;
  }

  if (order.status !== 'PAID' && order.status !== 'FULFILLED') {
    console.log(`Order ${orderId} not ready for WA, status: ${order.status}`);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  const buyerPhone = order.user?.phone;
  if (buyerPhone) {
    const summaryMessage = [
      '🎉 Pemesanan Berhasil!',
      '',
      `Event: ${order.event.title}`,
      `Tanggal: ${formatEventDate(order.event.startDate)}`,
      `Venue: ${order.event.venues?.[0]?.name || 'TBA'}, ${order.event.city}`,
      `Jumlah: ${order.tickets.length} tiket`,
      '',
      `Download semua tiket: ${env.CLOUDFLARE_R2_PUBLIC_URL}/orders/${orderId}/tickets`,
      '',
      'Terima kasih!'
    ].join('\n');

    const sent = await sendWaMessage(buyerPhone, summaryMessage);
    if (sent) successCount++;
    else failCount++;
  }

  for (const ticket of order.tickets) {
    if (!ticket.holderPhone || ticket.holderPhone === order.user?.phone) {
      continue;
    }

    const message = buildTicketMessage({
      holderName: ticket.holderName,
      eventTitle: order.event.title,
      eventDate: order.event.startDate,
      venueName: order.event.venues?.[0]?.name,
      city: order.event.city,
      categoryName: ticket.category.name,
      ticketCode: ticket.ticketCode,
      pdfUrl: ticket.pdfUrl || `${env.CLOUDFLARE_R2_PUBLIC_URL}/tickets/${ticket.id}.pdf`
    });

    if (!ticket.holderPhone) {
      failCount++;
      continue;
    }

    const sent = await sendWaMessage(ticket.holderPhone, message, ticket.pdfUrl || undefined);
    if (sent) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { waSentAt: new Date() }
      });
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`WA sent for order ${orderId}: ${successCount} success, ${failCount} failed`);
}

export function createTicketWaWorker() {
  const worker = new Worker(Queues.TICKET_WA, processor, {
    connection: redis,
    concurrency: 5
  });

  worker.on('failed', (job, err) => {
    console.error('ticket-wa failed:', { jobId: job?.id, error: err.message });
  });

  console.log('Ticket WA worker started');

  return worker;
}
