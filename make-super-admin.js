import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function makeSuperAdmin() {
  try {
    const user = await prisma.user.update({
      where: { email: 'sramadhan@gmail.com' },
      data: { role: 'SUPER_ADMIN' },
    });

    console.log('User updated to SUPER_ADMIN:', user);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

makeSuperAdmin();