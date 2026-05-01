import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NotificationService } from './notification.service';
import { NotificationType } from '../types/enums';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    systemConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

const mockPrisma = prisma as unknown as {
  notification: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  systemConfig: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

// ─── Generators ─────────────────────────────────────────────────────────────

const notificationTypeArb = fc.constantFrom<NotificationType>(
  NotificationType.MembershipExpiringSoon,
  NotificationType.MembershipExpired,
  NotificationType.PaymentOverdue,
  NotificationType.PaymentReceived
);

const notificationRecordArb = fc.record({
  id: fc.uuid(),
  adminId: fc.uuid(),
  type: notificationTypeArb,
  title: fc.string({ minLength: 1, maxLength: 100 }),
  message: fc.string({ minLength: 1, maxLength: 500 }),
  relatedMemberId: fc.option(fc.uuid(), { nil: null }),
  isRead: fc.boolean(),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
});

// ─── Property 12: Notification chronological ordering ───────────────────────

/**
 * Feature: gym-management, Property 12: Notification chronological ordering
 *
 * For any set of in-app notifications with distinct creation timestamps,
 * retrieving notifications SHALL return them sorted in descending order
 * by creation timestamp (most recent first).
 *
 * **Validates: Requirements 7.3**
 */
describe('Property 12: Notification chronological ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return notifications sorted in descending order by creation timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(notificationRecordArb, { minLength: 2, maxLength: 20 }),
        fc.uuid(),
        async (notifications, adminId) => {
          // Ensure all notifications have the same adminId and distinct timestamps
          const baseTime = new Date('2024-01-01').getTime();
          const notificationsWithDistinctTimes = notifications.map((n, index) => ({
            ...n,
            adminId,
            createdAt: new Date(baseTime + index * 60000), // 1 minute apart
          }));

          // Shuffle the notifications to simulate unordered DB state
          const shuffled = [...notificationsWithDistinctTimes].sort(() => Math.random() - 0.5);

          // The mock should return them sorted descending by createdAt
          // (simulating Prisma's orderBy: { createdAt: 'desc' })
          const sortedDesc = [...shuffled].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );

          mockPrisma.notification.findMany.mockResolvedValue(sortedDesc);
          mockPrisma.notification.count.mockResolvedValue(notificationsWithDistinctTimes.length);

          const service = new NotificationService();
          const result = await service.getInAppNotifications(adminId, { page: 1, pageSize: 100 });

          // Verify the results are in descending order by createdAt
          for (let i = 0; i < result.data.length - 1; i++) {
            const current = new Date(result.data[i].createdAt).getTime();
            const next = new Date(result.data[i + 1].createdAt).getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }

          // Verify the findMany was called with correct orderBy
          expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              orderBy: { createdAt: 'desc' },
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
