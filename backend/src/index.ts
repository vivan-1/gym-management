import app from './app';
import { prisma } from './lib/prisma';
import { DailyScheduler } from './scheduler/daily-scheduler';
import { MembershipService } from './services/membership.service';
import { PaymentService } from './services/payment.service';
import { NotificationService } from './services/notification.service';
import { EmailService } from './services/email.service';
import bcrypt from 'bcrypt';

const PORT = process.env.PORT || 4000;

/**
 * Auto-seed: creates the default admin user if none exists.
 * Runs on every startup — safe to call multiple times.
 */
async function autoSeed() {
  try {
    const adminCount = await prisma.admin.count();
    if (adminCount === 0) {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      await prisma.admin.create({
        data: {
          email: 'admin@gym.com',
          passwordHash,
        },
      });
      console.log('Auto-seeded admin user: admin@gym.com / Admin@123');
    }

    const configCount = await prisma.systemConfig.count();
    if (configCount === 0) {
      await prisma.systemConfig.create({
        data: {
          key: 'expiry_window_days',
          value: '7',
        },
      });
      console.log('Auto-seeded default expiry window: 7 days');
    }
  } catch (error) {
    console.error('Auto-seed error (non-fatal):', error);
  }
}

// Start the daily scheduler
const scheduler = new DailyScheduler({
  membershipService: new MembershipService(),
  paymentService: new PaymentService(),
  notificationService: new NotificationService(),
  emailService: new EmailService(),
  adminId: process.env.DEFAULT_ADMIN_ID || 'system',
});

async function start() {
  await autoSeed();
  scheduler.start();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();

// Graceful shutdown
process.on('SIGTERM', () => {
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  scheduler.stop();
  process.exit(0);
});

export default app;
