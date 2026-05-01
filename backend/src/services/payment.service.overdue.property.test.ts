import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PaymentService } from './payment.service';
import { PaymentStatus } from '../types/enums';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

const mockPrisma = prisma as unknown as {
  member: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  membership: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  payment: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
};

// ─── Property 10: Overdue payment status transition ─────────────────────────

/**
 * Feature: gym-management, Property 10: Overdue payment status transition
 *
 * For any membership with a Pending payment status where the membership start date
 * is more than 7 days before the current date, running the payment evaluation
 * SHALL update the payment status to Overdue.
 *
 * **Validates: Requirements 5.4**
 */
describe('Property 10: Overdue payment status transition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set Pending payments to Overdue when membership start date is more than 7 days before current date', async () => {
    // Generate days past start that are > 7 (should trigger overdue)
    const daysPastStartArb = fc.integer({ min: 8, max: 365 });

    await fc.assert(
      fc.asyncProperty(daysPastStartArb, fc.uuid(), fc.uuid(), async (daysPastStart, paymentId, memberId) => {
        const membershipStartDate = new Date('2024-01-01');
        // Current date is more than 7 days after membership start
        const currentDate = new Date(membershipStartDate);
        currentDate.setDate(currentDate.getDate() + daysPastStart);

        const paymentService = new PaymentService(() => currentDate);

        const mockPendingPayments = [
          {
            id: paymentId,
            membershipId: 'membership-1',
            memberId,
            amount: 100,
            paymentDate: membershipStartDate,
            paymentMethod: 'cash',
            status: PaymentStatus.Pending,
            membership: {
              id: 'membership-1',
              memberId,
              startDate: membershipStartDate,
              endDate: new Date('2024-12-31'),
              durationMonths: 12,
              status: 'active',
            },
            member: {
              id: memberId,
              memberId: 'GYM-AB12C',
            },
          },
        ];

        mockPrisma.payment.findMany.mockResolvedValue(mockPendingPayments);
        mockPrisma.payment.update.mockResolvedValue({
          ...mockPendingPayments[0],
          status: PaymentStatus.Overdue,
        });

        const result = await paymentService.evaluateOverdue();

        // Verify the payment was updated to Overdue
        expect(mockPrisma.payment.update).toHaveBeenCalledWith({
          where: { id: paymentId },
          data: { status: PaymentStatus.Overdue },
        });
        expect(result.newlyOverdue).toContain('GYM-AB12C');
        expect(result.totalEvaluated).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('should NOT set Pending payments to Overdue when membership start date is 7 days or less before current date', async () => {
    // Generate days past start that are <= 7 (should NOT trigger overdue)
    const daysPastStartArb = fc.integer({ min: 0, max: 7 });

    await fc.assert(
      fc.asyncProperty(daysPastStartArb, fc.uuid(), fc.uuid(), async (daysPastStart, paymentId, memberId) => {
        const membershipStartDate = new Date('2024-01-01');
        // Current date is 7 days or less after membership start
        const currentDate = new Date(membershipStartDate);
        currentDate.setDate(currentDate.getDate() + daysPastStart);

        const paymentService = new PaymentService(() => currentDate);

        const mockPendingPayments = [
          {
            id: paymentId,
            membershipId: 'membership-1',
            memberId,
            amount: 100,
            paymentDate: membershipStartDate,
            paymentMethod: 'cash',
            status: PaymentStatus.Pending,
            membership: {
              id: 'membership-1',
              memberId,
              startDate: membershipStartDate,
              endDate: new Date('2024-12-31'),
              durationMonths: 12,
              status: 'active',
            },
            member: {
              id: memberId,
              memberId: 'GYM-XY99Z',
            },
          },
        ];

        mockPrisma.payment.findMany.mockResolvedValue(mockPendingPayments);

        const result = await paymentService.evaluateOverdue();

        // Verify the payment was NOT updated
        expect(mockPrisma.payment.update).not.toHaveBeenCalled();
        expect(result.newlyOverdue).toHaveLength(0);
        expect(result.totalEvaluated).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle multiple pending payments with mixed overdue conditions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            daysPastStart: fc.integer({ min: 0, max: 60 }),
            memberMemberId: fc.stringOf(
              fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
              { minLength: 5, maxLength: 5 }
            ).map((s) => `GYM-${s}`),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (payments) => {
          // Clear mocks before each property iteration
          vi.clearAllMocks();

          const fixedDate = new Date('2024-06-15');
          const paymentService = new PaymentService(() => fixedDate);

          const mockPendingPayments = payments.map((p) => {
            const membershipStartDate = new Date(fixedDate);
            membershipStartDate.setDate(membershipStartDate.getDate() - p.daysPastStart);

            return {
              id: p.id,
              membershipId: `membership-${p.id}`,
              memberId: `member-${p.id}`,
              amount: 100,
              paymentDate: membershipStartDate,
              paymentMethod: 'cash',
              status: PaymentStatus.Pending,
              membership: {
                id: `membership-${p.id}`,
                memberId: `member-${p.id}`,
                startDate: membershipStartDate,
                endDate: new Date('2025-12-31'),
                durationMonths: 12,
                status: 'active',
              },
              member: {
                id: `member-${p.id}`,
                memberId: p.memberMemberId,
              },
            };
          });

          mockPrisma.payment.findMany.mockResolvedValue(mockPendingPayments);
          mockPrisma.payment.update.mockResolvedValue({});

          const result = await paymentService.evaluateOverdue();

          // Count expected overdue payments (daysPastStart > 7)
          const expectedOverdueCount = payments.filter((p) => p.daysPastStart > 7).length;
          expect(result.newlyOverdue.length).toBe(expectedOverdueCount);
          expect(result.totalEvaluated).toBe(payments.length);

          // Verify update was called for each overdue payment
          expect(mockPrisma.payment.update).toHaveBeenCalledTimes(expectedOverdueCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
