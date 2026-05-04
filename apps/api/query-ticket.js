import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ticket = await prisma.ticket.findUnique({
    where: { id: 'cmoitvnsr0006xpsd4c7j8exh' },
    select: { id: true, ticketCode: true, status: true, pdfUrl: true, userId: true, createdAt: true, generatedAt: true }
  });
  console.log(JSON.stringify(ticket, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());