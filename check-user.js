import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUser() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'sramadhan@gmail.com' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isVerified: true,
        status: true,
        createdAt: true,
      },
    });

    if (user) {
      console.log('User found:', user);
    } else {
      console.log('User not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();