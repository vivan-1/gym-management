import cron from 'node-cron';
import { MembershipService } from '../services/membership.service';
import { PaymentService } from '../services/payment.service';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { EmailTemplate, NotificationType } from '../types/enums';
import { DailyEvaluationResult } from '../types/interfaces';
import { prisma as defaultPrisma } from '../lib/prisma';

export interface DailySchedulerDependencies {
  membershipService: MembershipService;
  paymentService: PaymentService;
  notificationService: NotificationService;
  emailService: EmailService;
  adminId: string;
  cronExpression?: string;
  logger?: {
    info: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  prisma?: typeof defaultPrisma;
  getCurrentDate?: () => Date;
}

export class DailyScheduler {
  private membershipService: MembershipService;
  private paymentService: PaymentService;
  private notificationService: NotificationService;
  private emailService: EmailService;
  private adminId: string;
  private cronExpression: string;
  private logger: {
    info: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  private prisma: typeof defaultPrisma;
  private getCurrentDate: () => Date;
  private task: cron.ScheduledTask | null = null;

  constructor(deps: DailySchedulerDependencies) {
    this.membershipService = deps.membershipService;
    this.paymentService = deps.paymentService;
    this.notificationService = deps.notificationService;
    this.emailService = deps.emailService;
    this.adminId = deps.adminId;
    this.cronExpression = deps.cronExpression || '0 2 * * *'; // Default: 2 AM daily
    this.logger = deps.logger || { info: console.info, error: console.error };
    this.prisma = deps.prisma || defaultPrisma;
    this.getCurrentDate = deps.getCurrentDate || (() => new Date());
  }

  /**
   * Start the daily scheduler.
   */
  start(): void {
    if (this.task) {
      this.logger.info('Daily scheduler is already running');
      return;
    }

    this.task = cron.schedule(this.cronExpression, async () => {
      this.logger.info('Daily evaluation started');
      try {
        await this.runEvaluation();
      } catch (error) {
        this.logger.error('Daily evaluation failed with unexpected error', error);
      }
    });

    this.logger.info(`Daily scheduler started with cron expression: ${this.cronExpression}`);
  }

  /**
   * Stop the daily scheduler.
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.logger.info('Daily scheduler stopped');
    }
  }

  /**
   * Run the daily evaluation:
   * 1. Evaluate membership statuses
   * 2. Evaluate overdue payments
   * 3. Send notifications for status changes
   * 4. Send reminders for ongoing overdue payments
   * Individual failures do not halt the batch.
   */
  async runEvaluation(): Promise<DailyEvaluationResult> {
    const errors: string[] = [];
    let notificationsSent = 0;

    // Step 1: Evaluate membership statuses
    const membershipEvaluation = await this.membershipService.evaluateStatuses();
    this.logger.info(
      `Membership evaluation complete: ${membershipEvaluation.newlyExpiringSoon.length} newly expiring soon, ${membershipEvaluation.newlyExpired.length} newly expired`
    );

    // Step 2: Evaluate overdue payments
    const overdueEvaluation = await this.paymentService.evaluateOverdue();
    this.logger.info(
      `Payment evaluation complete: ${overdueEvaluation.newlyOverdue.length} newly overdue`
    );

    // Step 3: Send notifications for newly Expiring_Soon memberships
    for (const memberId of membershipEvaluation.newlyExpiringSoon) {
      try {
        const member = await this.prisma.member.findFirst({
          where: { memberId },
          include: { memberships: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });

        if (member) {
          // Send email to member
          await this.emailService.sendEmail(member.email, EmailTemplate.MembershipExpiring, {
            memberName: member.fullName,
            endDate: member.memberships[0]?.endDate?.toISOString().split('T')[0] || '',
          });

          // Create in-app notification for admin
          await this.notificationService.createInAppNotification(this.adminId, {
            type: NotificationType.MembershipExpiringSoon,
            title: 'Membership Expiring Soon',
            message: `${member.fullName}'s membership is expiring soon.`,
            relatedMemberId: member.id,
          });

          notificationsSent += 2;
        }
      } catch (error) {
        const errorMsg = `Failed to send expiring soon notification for member ${memberId}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Step 4: Send notifications for newly Expired memberships
    for (const memberId of membershipEvaluation.newlyExpired) {
      try {
        const member = await this.prisma.member.findFirst({
          where: { memberId },
          include: { memberships: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });

        if (member) {
          // Send email to member
          await this.emailService.sendEmail(member.email, EmailTemplate.MembershipExpired, {
            memberName: member.fullName,
            endDate: member.memberships[0]?.endDate?.toISOString().split('T')[0] || '',
          });

          // Create in-app notification for admin
          await this.notificationService.createInAppNotification(this.adminId, {
            type: NotificationType.MembershipExpired,
            title: 'Membership Expired',
            message: `${member.fullName}'s membership has expired.`,
            relatedMemberId: member.id,
          });

          notificationsSent += 2;
        }
      } catch (error) {
        const errorMsg = `Failed to send expired notification for member ${memberId}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Step 5: Send notifications for newly Overdue payments
    for (const memberId of overdueEvaluation.newlyOverdue) {
      try {
        const member = await this.prisma.member.findFirst({
          where: { memberId },
          include: {
            memberships: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { payments: { where: { status: 'overdue' }, take: 1 } },
            },
          },
        });

        if (member) {
          const overduePayment = member.memberships[0]?.payments[0];
          const amount = overduePayment?.amount || 0;

          // Send email to member
          await this.emailService.sendEmail(member.email, EmailTemplate.PaymentOverdueReminder, {
            memberName: member.fullName,
            amount: amount.toString(),
          });

          // Create in-app notification for admin
          await this.notificationService.createInAppNotification(this.adminId, {
            type: NotificationType.PaymentOverdue,
            title: 'Payment Overdue',
            message: `${member.fullName} has an overdue payment.`,
            relatedMemberId: member.id,
          });

          notificationsSent += 2;
        }
      } catch (error) {
        const errorMsg = `Failed to send overdue notification for member ${memberId}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Step 6: Send reminder emails for ongoing overdue payments (every 7 days)
    try {
      const ongoingOverdueNotifications = await this.sendOngoingOverdueReminders();
      notificationsSent += ongoingOverdueNotifications;
    } catch (error) {
      const errorMsg = `Failed to process ongoing overdue reminders: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);
    }

    // Log summary
    this.logger.info(
      `Daily evaluation summary: ${notificationsSent} notifications sent, ${errors.length} errors`
    );

    return {
      membershipEvaluation,
      overdueEvaluation,
      notificationsSent,
      errors,
    };
  }

  /**
   * Send reminder emails for ongoing overdue payments.
   * Only sends if 7 days have passed since the last reminder notification for that member.
   */
  private async sendOngoingOverdueReminders(): Promise<number> {
    let remindersSent = 0;

    // Find all overdue payments (excluding newly overdue ones already handled above)
    const overduePayments = await this.prisma.payment.findMany({
      where: { status: 'overdue' },
      include: {
        member: true,
        membership: true,
      },
    });

    const now = this.getCurrentDate();

    for (const payment of overduePayments) {
      try {
        // Check when the last overdue reminder notification was sent for this member
        const lastReminder = await this.prisma.notification.findFirst({
          where: {
            relatedMemberId: payment.member.id,
            type: NotificationType.PaymentOverdue,
          },
          orderBy: { createdAt: 'desc' },
        });

        // Send reminder if no previous reminder exists or 7+ days have passed
        const shouldSendReminder = !lastReminder ||
          this.daysBetween(lastReminder.createdAt, now) >= 7;

        if (shouldSendReminder) {
          await this.emailService.sendEmail(
            payment.member.email,
            EmailTemplate.PaymentOverdueReminder,
            {
              memberName: payment.member.fullName,
              amount: payment.amount.toString(),
            }
          );
          remindersSent++;
        }
      } catch (error) {
        const errorMsg = `Failed to send ongoing overdue reminder for member ${payment.member.memberId}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(errorMsg);
        // Individual failures do not halt the batch
      }
    }

    return remindersSent;
  }

  /**
   * Calculate the number of full days between two dates.
   */
  private daysBetween(date1: Date, date2: Date): number {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  }
}
