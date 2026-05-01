import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { DashboardService } from './dashboard.service';
import { MembershipStatus, PaymentStatus } from '../types/enums';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    member: {
      count: vi.fn(),
    },
    membership: {
      count: vi.fn(),
    },
    payment: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    systemConfig: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

const mockPrisma = prisma as unknown as {
  member: {
    count: ReturnType<typeof vi.fn>;
  };
  membership: {
    count: ReturnType<typeof vi.fn>;
  };
  payment: {
    aggregate: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  notification: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  systemConfig: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// ─── Generators ─────────────────────────────────────────────────────────────

const memberCountArb = fc.nat({ max: 1000 });

const membershipCountsArb = fc.record({
  active: fc.nat({ max: 500 }),
  expiringSoon: fc.nat({ max: 500 }),
  expired: fc.nat({ max: 500 }),
});

const paymentSummaryArb = fc.record({
  totalCollected: fc.float({ min: 0, max: 100000, noNaN: true }),
  pendingCount: fc.nat({ max: 500 }),
  overdueCount: fc.nat({ max: 500 }),
});

// ─── Property 11: Dashboard summary accuracy ────────────────────────────────

/**
 * Feature: gym-management, Property 11: Dashboard summary accuracy
 *
 * For any set of members, memberships, and payments in the system,
 * the dashboard summary SHALL report:
 * - Total registered members equal to the actual count of member records
 * - Active, Expiring_Soon, and Expired membership counts equal to the actual count of memberships in each status
 * - Total payments collected equal to the sum of all Paid payment amounts
 * - Pending and overdue payment counts equal to the actual count of payments in each status
 *
 * **Validates: Requirements 3.4, 5.6, 7.1**
 */
describe('Property 11: Dashboard summary accuracy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report total members equal to actual member record count', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberCountArb,
        membershipCountsArb,
        paymentSummaryArb,
        fc.uuid(),
        async (totalMembers, membershipCounts, paymentSummary, adminId) => {
          // Setup mocks to return the generated data
          mockPrisma.member.count.mockResolvedValue(totalMembers);

          // Mock membership counts (called by membershipService.getStatusCounts)
          mockPrisma.membership.count.mockImplementation(
            (args: { where: { status: string } }) => {
              if (args.where.status === MembershipStatus.Active) {
                return Promise.resolve(membershipCounts.active);
              }
              if (args.where.status === MembershipStatus.ExpiringSoon) {
                return Promise.resolve(membershipCounts.expiringSoon);
              }
              if (args.where.status === MembershipStatus.Expired) {
                return Promise.resolve(membershipCounts.expired);
              }
              return Promise.resolve(0);
            }
          );

          // Mock payment summary (called by paymentService.getPaymentSummary)
          mockPrisma.payment.aggregate.mockResolvedValue({
            _sum: { amount: paymentSummary.totalCollected },
          });
          mockPrisma.payment.count.mockImplementation(
            (args: { where: { status: string } }) => {
              if (args.where.status === PaymentStatus.Pending) {
                return Promise.resolve(paymentSummary.pendingCount);
              }
              if (args.where.status === PaymentStatus.Overdue) {
                return Promise.resolve(paymentSummary.overdueCount);
              }
              return Promise.resolve(0);
            }
          );

          // Mock notifications
          mockPrisma.notification.findMany.mockResolvedValue([]);
          mockPrisma.notification.count.mockResolvedValue(0);

          const service = new DashboardService();
          const summary = await service.getSummary(adminId);

          // Verify total members matches actual count
          expect(summary.totalMembers).toBe(totalMembers);

          // Verify membership counts match actual counts
          expect(summary.membershipCounts.active).toBe(membershipCounts.active);
          expect(summary.membershipCounts.expiringSoon).toBe(membershipCounts.expiringSoon);
          expect(summary.membershipCounts.expired).toBe(membershipCounts.expired);

          // Verify payment summary matches actual data
          expect(summary.paymentSummary.totalCollected).toBe(paymentSummary.totalCollected);
          expect(summary.paymentSummary.pendingCount).toBe(paymentSummary.pendingCount);
          expect(summary.paymentSummary.overdueCount).toBe(paymentSummary.overdueCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should report membership status counts that sum correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        membershipCountsArb,
        fc.uuid(),
        async (membershipCounts, adminId) => {
          // Setup mocks
          mockPrisma.member.count.mockResolvedValue(0);
          mockPrisma.membership.count.mockImplementation(
            (args: { where: { status: string } }) => {
              if (args.where.status === MembershipStatus.Active) {
                return Promise.resolve(membershipCounts.active);
              }
              if (args.where.status === MembershipStatus.ExpiringSoon) {
                return Promise.resolve(membershipCounts.expiringSoon);
              }
              if (args.where.status === MembershipStatus.Expired) {
                return Promise.resolve(membershipCounts.expired);
              }
              return Promise.resolve(0);
            }
          );
          mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
          mockPrisma.payment.count.mockResolvedValue(0);
          mockPrisma.notification.findMany.mockResolvedValue([]);
          mockPrisma.notification.count.mockResolvedValue(0);

          const service = new DashboardService();
          const summary = await service.getSummary(adminId);

          // Each individual count should be non-negative
          expect(summary.membershipCounts.active).toBeGreaterThanOrEqual(0);
          expect(summary.membershipCounts.expiringSoon).toBeGreaterThanOrEqual(0);
          expect(summary.membershipCounts.expired).toBeGreaterThanOrEqual(0);

          // The sum of all status counts should equal the total memberships
          const totalMemberships =
            membershipCounts.active + membershipCounts.expiringSoon + membershipCounts.expired;
          const summaryTotal =
            summary.membershipCounts.active +
            summary.membershipCounts.expiringSoon +
            summary.membershipCounts.expired;
          expect(summaryTotal).toBe(totalMemberships);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should report payment counts that match actual payment status counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        paymentSummaryArb,
        fc.uuid(),
        async (paymentSummary, adminId) => {
          // Setup mocks
          mockPrisma.member.count.mockResolvedValue(0);
          mockPrisma.membership.count.mockResolvedValue(0);
          mockPrisma.payment.aggregate.mockResolvedValue({
            _sum: { amount: paymentSummary.totalCollected },
          });
          mockPrisma.payment.count.mockImplementation(
            (args: { where: { status: string } }) => {
              if (args.where.status === PaymentStatus.Pending) {
                return Promise.resolve(paymentSummary.pendingCount);
              }
              if (args.where.status === PaymentStatus.Overdue) {
                return Promise.resolve(paymentSummary.overdueCount);
              }
              return Promise.resolve(0);
            }
          );
          mockPrisma.notification.findMany.mockResolvedValue([]);
          mockPrisma.notification.count.mockResolvedValue(0);

          const service = new DashboardService();
          const summary = await service.getSummary(adminId);

          // Verify payment summary accuracy
          expect(summary.paymentSummary.totalCollected).toBe(paymentSummary.totalCollected);
          expect(summary.paymentSummary.pendingCount).toBe(paymentSummary.pendingCount);
          expect(summary.paymentSummary.overdueCount).toBe(paymentSummary.overdueCount);

          // Total collected should be non-negative
          expect(summary.paymentSummary.totalCollected).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
