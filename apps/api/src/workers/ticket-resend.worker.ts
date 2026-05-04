import { Worker } from 'bullmq';
import { redis, Queues } from '../services/redis.js';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/email.js';

const prisma = new PrismaClient();

async function sendWA(phone: string, message: string): Promise<boolean> {
  // WA sending implementation would go here
  // For now, just log it
  console.log(`[WA_RESEND] Would send WA to ${phone}: ${message}`);
  return true;
}

async function processor(job: { data: { ticketId: string; channel: string } }) {
  const { ticketId, channel } = job.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      category: true,
      order: {
        include: {
          event: true,
          user: { select: { email: true, phone: true } }
        }
      }
    }
  });

  if (!ticket) {
    console.log(`[TICKET_RESEND] Ticket ${ticketId} not found`);
    return;
  }

  if (ticket.status !== 'ACTIVE') {
    console.log(`[TICKET_RESEND] Ticket ${ticketId} not active (status: ${ticket.status})`);
    return;
  }

  const user = ticket.order.user;
  if (!user) {
    console.log(`[TICKET_RESEND] No user found for ticket ${ticketId}`);
    return;
  }

  let emailSuccess = false;
  let waSuccess = false;

  if (channel === 'email' || channel === 'both') {
    if (user.email) {
      const subject = `Tiket ${ticket.order.event.title}`;
      const html = `
        <h2>Tiket Anda</h2>
        <p>Event: ${ticket.order.event.title}</p>
        <p>Kategori: ${ticket.category.name}</p>
        <p>Kode Tiket: ${ticket.ticketCode}</p>
        <p>Nama Pemegang: ${ticket.holderName}</p>
        <p><a href="${ticket.pdfUrl}">Download Tiket</a></p>
      `;

      try {
        await sendEmail({ to: user.email, subject, html });
        emailSuccess = true;
      } catch (error) {
        emailSuccess = false;
      }
      console.log(`[TICKET_RESEND] Email ${emailSuccess ? 'sent' : 'failed'} for ticket ${ticketId}`);
    }
  }

  if (channel === 'whatsapp' || channel === 'both') {
    if (user.phone) {
      const message = `🎫 *TIKET ANDA*\n\nEvent: ${ticket.order.event.title}\nKategori: ${ticket.category.name}\nKode: ${ticket.ticketCode}\nPemegang: ${ticket.holderName}\n\nDownload: ${ticket.pdfUrl}`;

      waSuccess = await sendWA(user.phone, message);
      console.log(`[TICKET_RESEND] WA ${waSuccess ? 'sent' : 'failed'} for ticket ${ticketId}`);
    }
  }

  // Update resend timestamp
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      emailSentAt: emailSuccess ? new Date() : undefined,
      waSentAt: waSuccess ? new Date() : undefined,
    }
  });
}

export function createTicketResendWorker() {
  const worker = new Worker(Queues.TICKET_RESEND, processor, {
    connection: redis,
    concurrency: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  worker.on('failed', (job, err) => {
    console.error('ticket:resend failed:', { jobId: job?.id, error: err.message });
  });

  worker.on('completed', (job) => {
    console.log(`ticket:resend completed for ticket ${job?.data?.ticketId}`);
  });

  console.log('Ticket resend worker started');

  return worker;
}
