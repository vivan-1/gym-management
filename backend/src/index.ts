import app from './app';
import { DailyScheduler } from './scheduler/daily-scheduler';
import { MembershipService } from './services/membership.service';
import { PaymentService } from './services/payment.service';
import { NotificationService } from './services/notification.service';
import { EmailService } from './services/email.service';

const PORT = process.env.PORT || 4000;

// Start the daily scheduler
const scheduler = new DailyScheduler({
  membershipService: new MembershipService(),
  paymentService: new PaymentService(),
  notificationService: new NotificationService(),
  emailService: new EmailService(),
  adminId: process.env.DEFAULT_ADMIN_ID || 'system',
});

scheduler.start();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

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
