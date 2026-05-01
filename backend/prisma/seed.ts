import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin@123', 10);

  const admin = await prisma.admin.upsert({
    where: { email: 'admin@gym.com' },
    update: {},
    create: {
      email: 'admin@gym.com',
      passwordHash,
    },
  });

  // Seed default expiry window config
  await prisma.systemConfig.upsert({
    where: { key: 'expiry_window_days' },
    update: {},
    create: {
      key: 'expiry_window_days',
      value: '7',
    },
  });

  console.log('Seeded admin user:', admin.email);
  console.log('Login credentials: admin@gym.com / Admin@123');
  console.log('Default expiry window: 7 days');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
