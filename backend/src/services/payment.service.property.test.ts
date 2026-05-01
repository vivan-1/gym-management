import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PaymentService, PaymentServiceError } from './payment.service';
import { PaymentStatus, PaymentMethod } from '../types/enums';

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
    create: ReturnType<typeof vi.fn>;
  };
  payment: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
};

// ─── Generators ─────────────────────────────────────────────────────────────

const paymentMethodArb = fc.constantFrom<PaymentMethod>(
  PaymentMethod.Cash,
  PaymentMethod.Card,
  PaymentMethod.OnlineTransfer
);

const positiveAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true })
  .filter((n) => n > 0 && isFinite(n));

const paymentDateArb = fc.date({
  min: new Date('2000-01-01'),
  max: new Date('2030-12-31'),
});

// ─── Property 8: Payment recording stores all fields with Paid status ───────

/**
 * Feature: gym-management, Property 8: Payment recording stores all fields with Paid status
 *
 * For any valid payment input (positive amount, valid date, valid payment method,
 * and valid membership ID), recording the payment SHALL create a Payment record
 * that preserves all input fields and sets the payment status to Paid.
 *
 * **Validates: Requirements 5.1, 5.2**
 */
describe('Property 8: Payment recording stores all fields with Paid status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve all input fields and set status to Paid for any valid payment', async () => {
    await fc.assert(
      fc.asyncProperty(
        positiveAmountArb,
        paymentDateArb,
        paymentMethodArb,
        fc.uuid(),
        fc.uuid(),
        async (amount, paymentDate, paymentMethod, membershipId, memberId) => {
          const paymentService = new PaymentService();

          const mockMembership = {
            id: membershipId,
            memberId,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
            durationMonths: 12,
            status: 'active',
          };

          const mockMember = {
            id: memberId,
            memberId: 'GYM-AB12C',
            fullName: 'Test User',
            email: 'test@example.com',
          };

          mockPrisma.membership.findUnique.mockResolvedValue(mockMembership);
          mockPrisma.member.findUnique.mockResolvedValue(mockMember);
          mockPrisma.payment.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: 'payment-uuid-1',
              ...data,
              createdAt: new Date(),
            })
          );

          const result = await paymentService.record(memberId, {
            amount,
            paymentDate,
            paymentMethod,
            membershipId,
          });

          // Verify all input fields are preserved
          expect(result.amount).toBe(amount);
          expect(result.paymentMethod).toBe(paymentMethod);
          expect(result.membershipId).toBe(membershipId);
          expect(result.memberId).toBe(memberId);

          // Verify status is set to Paid
          expect(result.status).toBe(PaymentStatus.Paid);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject payments with non-positive amounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: -10000, max: 0, noNaN: true }),
        paymentDateArb,
        paymentMethodArb,
        fc.uuid(),
        fc.uuid(),
        async (amount, paymentDate, paymentMethod, membershipId, memberId) => {
          const paymentService = new PaymentService();

          await expect(
            paymentService.record(memberId, {
              amount,
              paymentDate,
              paymentMethod,
              membershipId,
            })
          ).rejects.toThrow(PaymentServiceError);
        }
      ),
      { numRuns: 100 }
    );
  });
});
