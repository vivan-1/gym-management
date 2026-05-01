import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyScheduler, DailySchedulerDependencies } from './daily-scheduler';
import { EmailTemplate, NotificationType } from '../types/enums';

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expression: string, callback: () => void) => {
      return {
        stop: vi.fn(),
        _callback: callback,
      };
    }),
  },
}));

function createMockDependencies(): DailySchedulerDependencies & {
  membershipService: any;
  paymentService: any;
  notificationService: any;
  emailService: any;
  prisma: any;
  logger: any;
} {
  return {
    membershipService: {
      evaluateStatuses: vi.fn().mockResolvedValue({
        newlyExpiringSoon: [],
        newlyExpired: [],
        totalEvaluated: 0,
      }),
    },
    paymentService: {
      evaluateOverdue: vi.fn().mockResolvedValue({
        newlyOverdue: [],
        totalEvaluated: 0,
      }),
    },
    notificationService: {
      createInAppNotification: vi.fn().mockResolvedValue({}),
    },
    emailService: {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    },
    adminId: 'admin-123',
    cronExpression: '0 2 * * *',
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
    prisma: {
      member: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    getCurrentDate: () => new Date('2024-03-15'),
  };
}

describe('DailyScheduler', () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let scheduler: DailyScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDependencies();
    scheduler = new DailyScheduler(deps);
  });

  describe('start() and stop()', () => {
    it('should start the cron job', async () => {
      const cron = await import('node-cron');
      scheduler.start();
      expect(cron.default.schedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Daily scheduler started')
      );
    });

    it('should not start a second cron job if already running', async () => {
      const cron = await import('node-cron');
      scheduler.start();
      scheduler.start();
      expect(cron.default.schedule).toHaveBeenCalledTimes(1);
      expect(deps.logger.info).toHaveBeenCalledWith('Daily scheduler is already running');
    });

    it('should stop the cron job', () => {
      scheduler.start();
      scheduler.stop();
      expect(deps.logger.info).toHaveBeenCalledWith('Daily scheduler stopped');
    });

    it('should do nothing when stopping without starting', () => {
      scheduler.stop();
      // Should not throw or log "stopped"
      expect(deps.logger.info).not.toHaveBeenCalledWith('Daily scheduler stopped');
    });
  });

  describe('runEvaluation()', () => {
    it('should call membershipService.evaluateStatuses() and paymentService.evaluateOverdue()', async () => {
      const result = await scheduler.runEvaluation();

      expect(deps.membershipService.evaluateStatuses).toHaveBeenCalledTimes(1);
      expect(deps.paymentService.evaluateOverdue).toHaveBeenCalledTimes(1);
      expect(result.membershipEvaluation).toEqual({
        newlyExpiringSoon: [],
        newlyExpired: [],
        totalEvaluated: 0,
      });
      expect(result.overdueEvaluation).toEqual({
        newlyOverdue: [],
        totalEvaluated: 0,
      });
    });

    it('should send email and in-app notification for newly Expiring_Soon memberships', async () => {
      deps.membershipService.evaluateStatuses.mockResolvedValue({
        newlyExpiringSoon: ['MEM-001'],
        newlyExpired: [],
        totalEvaluated: 5,
      });

      deps.prisma.member.findFirst.mockResolvedValue({
        id: 'uuid-1',
        memberId: 'MEM-001',
        fullName: 'John Doe',
        email: 'john@example.com',
        memberships: [{ endDate: new Date('2024-03-22') }],
      });

      const result = await scheduler.runEvaluation();

      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
        'john@example.com',
        EmailTemplate.MembershipExpiring,
        expect.objectContaining({ memberName: 'John Doe' })
      );

      expect(deps.notificationService.createInAppNotification).toHaveBeenCalledWith(
        'admin-123',
        expect.objectContaining({
          type: NotificationType.MembershipExpiringSoon,
          title: 'Membership Expiring Soon',
          relatedMemberId: 'uuid-1',
        })
      );

      expect(result.notificationsSent).toBeGreaterThanOrEqual(2);
    });

    it('should send email and in-app notification for newly Expired memberships', async () => {
      deps.membershipService.evaluateStatuses.mockResolvedValue({
        newlyExpiringSoon: [],
        newlyExpired: ['MEM-002'],
        totalEvaluated: 5,
      });

      deps.prisma.member.findFirst.mockResolvedValue({
        id: 'uuid-2',
        memberId: 'MEM-002',
        fullName: 'Jane Smith',
        email: 'jane@example.com',
        memberships: [{ endDate: new Date('2024-03-10') }],
      });

      const result = await scheduler.runEvaluation();

      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
        'jane@example.com',
        EmailTemplate.MembershipExpired,
        expect.objectContaining({ memberName: 'Jane Smith' })
      );

      expect(deps.notificationService.createInAppNotification).toHaveBeenCalledWith(
        'admin-123',
        expect.objectContaining({
          type: NotificationType.MembershipExpired,
          title: 'Membership Expired',
          relatedMemberId: 'uuid-2',
        })
      );

      expect(result.notificationsSent).toBeGreaterThanOrEqual(2);
    });

    it('should send email and in-app notification for newly Overdue payments', async () => {
      deps.paymentService.evaluateOverdue.mockResolvedValue({
        newlyOverdue: ['MEM-003'],
        totalEvaluated: 3,
      });

      deps.prisma.member.findFirst.mockResolvedValue({
        id: 'uuid-3',
        memberId: 'MEM-003',
        fullName: 'Bob Wilson',
        email: 'bob@example.com',
        memberships: [{ payments: [{ amount: 50 }] }],
      });

      const result = await scheduler.runEvaluation();

      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
        'bob@example.com',
        EmailTemplate.PaymentOverdueReminder,
        expect.objectContaining({ memberName: 'Bob Wilson', amount: '50' })
      );

      expect(deps.notificationService.createInAppNotification).toHaveBeenCalledWith(
        'admin-123',
        expect.objectContaining({
          type: NotificationType.PaymentOverdue,
          title: 'Payment Overdue',
          relatedMemberId: 'uuid-3',
        })
      );

      expect(result.notificationsSent).toBeGreaterThanOrEqual(2);
    });

    it('should not halt the batch when individual notification fails', async () => {
      deps.membershipService.evaluateStatuses.mockResolvedValue({
        newlyExpiringSoon: ['MEM-001', 'MEM-002'],
        newlyExpired: [],
        totalEvaluated: 5,
      });

      // First member lookup succeeds but email fails
      deps.prisma.member.findFirst
        .mockResolvedValueOnce({
          id: 'uuid-1',
          memberId: 'MEM-001',
          fullName: 'John Doe',
          email: 'john@example.com',
          memberships: [{ endDate: new Date('2024-03-22') }],
        })
        .mockResolvedValueOnce({
          id: 'uuid-2',
          memberId: 'MEM-002',
          fullName: 'Jane Smith',
          email: 'jane@example.com',
          memberships: [{ endDate: new Date('2024-03-22') }],
        });

      // First email call fails, subsequent ones succeed
      deps.emailService.sendEmail
        .mockRejectedValueOnce(new Error('SMTP connection failed'))
        .mockResolvedValue(undefined);

      const result = await scheduler.runEvaluation();

      // Should have errors but still process second member
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('MEM-001');

      // Second member should still be processed
      // The notification for the second member should have been attempted
      expect(deps.prisma.member.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should log evaluation summary', async () => {
      await scheduler.runEvaluation();

      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Daily evaluation summary')
      );
    });
  });

  describe('ongoing overdue reminders', () => {
    it('should send reminder email for overdue payments when 7+ days since last reminder', async () => {
      deps.prisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          memberId: 'uuid-4',
          amount: 100,
          status: 'overdue',
          member: {
            id: 'uuid-4',
            memberId: 'MEM-004',
            fullName: 'Alice Brown',
            email: 'alice@example.com',
          },
          membership: { startDate: new Date('2024-02-01') },
        },
      ]);

      // Last reminder was 8 days ago
      deps.prisma.notification.findFirst.mockResolvedValue({
        createdAt: new Date('2024-03-07'),
      });

      const result = await scheduler.runEvaluation();

      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
        'alice@example.com',
        EmailTemplate.PaymentOverdueReminder,
        expect.objectContaining({ memberName: 'Alice Brown', amount: '100' })
      );

      expect(result.notificationsSent).toBeGreaterThanOrEqual(1);
    });

    it('should NOT send reminder email if less than 7 days since last reminder', async () => {
      deps.prisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          memberId: 'uuid-4',
          amount: 100,
          status: 'overdue',
          member: {
            id: 'uuid-4',
            memberId: 'MEM-004',
            fullName: 'Alice Brown',
            email: 'alice@example.com',
          },
          membership: { startDate: new Date('2024-02-01') },
        },
      ]);

      // Last reminder was 3 days ago (less than 7)
      deps.prisma.notification.findFirst.mockResolvedValue({
        createdAt: new Date('2024-03-12'),
      });

      const result = await scheduler.runEvaluation();

      // Email should NOT be sent for ongoing overdue (only newly overdue would trigger)
      expect(deps.emailService.sendEmail).not.toHaveBeenCalledWith(
        'alice@example.com',
        EmailTemplate.PaymentOverdueReminder,
        expect.anything()
      );
    });

    it('should send reminder email if no previous reminder exists', async () => {
      deps.prisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-2',
          memberId: 'uuid-5',
          amount: 75,
          status: 'overdue',
          member: {
            id: 'uuid-5',
            memberId: 'MEM-005',
            fullName: 'Charlie Davis',
            email: 'charlie@example.com',
          },
          membership: { startDate: new Date('2024-02-01') },
        },
      ]);

      // No previous reminder
      deps.prisma.notification.findFirst.mockResolvedValue(null);

      const result = await scheduler.runEvaluation();

      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
        'charlie@example.com',
        EmailTemplate.PaymentOverdueReminder,
        expect.objectContaining({ memberName: 'Charlie Davis', amount: '75' })
      );

      expect(result.notificationsSent).toBeGreaterThanOrEqual(1);
    });

    it('should continue processing other overdue payments when one fails', async () => {
      deps.prisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          memberId: 'uuid-4',
          amount: 100,
          status: 'overdue',
          member: {
            id: 'uuid-4',
            memberId: 'MEM-004',
            fullName: 'Alice Brown',
            email: 'alice@example.com',
          },
          membership: { startDate: new Date('2024-02-01') },
        },
        {
          id: 'pay-2',
          memberId: 'uuid-5',
          amount: 75,
          status: 'overdue',
          member: {
            id: 'uuid-5',
            memberId: 'MEM-005',
            fullName: 'Charlie Davis',
            email: 'charlie@example.com',
          },
          membership: { startDate: new Date('2024-02-01') },
        },
      ]);

      // No previous reminders for either
      deps.prisma.notification.findFirst.mockResolvedValue(null);

      // First email fails, second succeeds
      deps.emailService.sendEmail
        .mockRejectedValueOnce(new Error('Email failed'))
        .mockResolvedValue(undefined);

      const result = await scheduler.runEvaluation();

      // Both should have been attempted
      expect(deps.emailService.sendEmail).toHaveBeenCalledTimes(2);
      // Second one should succeed
      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
        'charlie@example.com',
        EmailTemplate.PaymentOverdueReminder,
        expect.anything()
      );
    });
  });
});
