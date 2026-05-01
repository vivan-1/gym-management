import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { MembershipService, MembershipServiceError, addMonths } from './membership.service';
import { MembershipStatus } from '../types/enums';
import { MembershipDuration } from '../types/interfaces';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
    },
    membership: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
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
    findUnique: ReturnType<typeof vi.fn>;
  };
  membership: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  systemConfig: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// ─── Generators ─────────────────────────────────────────────────────────────

const durationArb = fc.constantFrom<MembershipDuration>(1, 3, 6, 12);

const startDateArb = fc.date({
  min: new Date('2000-01-01'),
  max: new Date('2030-12-31'),
});

// ─── Property 4: Membership end date calculation ────────────────────────────

/**
 * Feature: gym-management, Property 4: Membership end date calculation
 *
 * For any valid start date and membership duration (1, 3, 6, or 12 months),
 * the calculated end date SHALL equal the start date plus exactly the specified
 * number of months.
 *
 * **Validates: Requirements 2.2**
 */
describe('Property 4: Membership end date calculation', () => {
  it('should calculate end date as start date plus exactly the specified months', () => {
    fc.assert(
      fc.property(startDateArb, durationArb, (startDate, duration) => {
        const endDate = addMonths(startDate, duration);

        // The end date should be exactly `duration` months after the start date
        const expectedMonth = (startDate.getMonth() + duration) % 12;
        const expectedYear =
          startDate.getFullYear() + Math.floor((startDate.getMonth() + duration) / 12);

        expect(endDate.getFullYear()).toBe(expectedYear);
        expect(endDate.getMonth()).toBe(expectedMonth);

        // Day should be the same, unless month-end overflow occurred
        const originalDay = startDate.getDate();
        const daysInTargetMonth = new Date(expectedYear, expectedMonth + 1, 0).getDate();

        if (originalDay <= daysInTargetMonth) {
          // Normal case: day should be preserved
          expect(endDate.getDate()).toBe(originalDay);
        } else {
          // Overflow case: day should be clamped to last day of target month
          expect(endDate.getDate()).toBe(daysInTargetMonth);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should always produce an end date strictly after the start date', () => {
    fc.assert(
      fc.property(startDateArb, durationArb, (startDate, duration) => {
        const endDate = addMonths(startDate, duration);
        expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: New membership status is Active when current date is in range ─

/**
 * Feature: gym-management, Property 5: New membership status is Active when current date is in range
 *
 * For any newly created membership where the current date falls between the start date
 * and end date (inclusive), the membership status SHALL be set to Active.
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 5: New membership status is Active when current date is in range', () => {
  it('should set status to Active when current date is between start and end date', async () => {
    await fc.assert(
      fc.asyncProperty(durationArb, async (duration) => {
        // Generate a start date that ensures the current date is within the membership range
        // We'll set the "current date" to be between start and end
        const startDate = new Date('2024-01-15');
        const endDate = addMonths(startDate, duration);

        // Pick a current date between start and end
        const startMs = startDate.getTime();
        const endMs = endDate.getTime();
        const midMs = startMs + Math.floor((endMs - startMs) / 2);
        const currentDate = new Date(midMs);

        const membershipService = new MembershipService(() => currentDate);

        const mockMember = {
          id: 'member-uuid-1',
          memberId: 'GYM-AB12C',
          fullName: 'Test User',
          email: 'test@example.com',
        };

        mockPrisma.member.findUnique.mockResolvedValue(mockMember);
        mockPrisma.membership.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'membership-uuid-1',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        );

        const result = await membershipService.create(mockMember.id, {
          startDate,
          duration,
        });

        expect(result.status).toBe(MembershipStatus.Active);
      }),
      { numRuns: 100 }
    );
  });

  it('should set status to Active when current date equals start date', async () => {
    await fc.assert(
      fc.asyncProperty(durationArb, async (duration) => {
        const startDate = new Date('2024-03-01');
        const currentDate = new Date('2024-03-01'); // same as start

        const membershipService = new MembershipService(() => currentDate);

        const mockMember = {
          id: 'member-uuid-1',
          memberId: 'GYM-AB12C',
          fullName: 'Test User',
          email: 'test@example.com',
        };

        mockPrisma.member.findUnique.mockResolvedValue(mockMember);
        mockPrisma.membership.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'membership-uuid-1',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        );

        const result = await membershipService.create(mockMember.id, {
          startDate,
          duration,
        });

        expect(result.status).toBe(MembershipStatus.Active);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Membership renewal extends from correct base date ──────────

/**
 * Feature: gym-management, Property 6: Membership renewal extends from correct base date
 *
 * For any active membership, renewal SHALL calculate the new end date by extending
 * from the current end date. For any expired membership, renewal SHALL calculate
 * the new end date by extending from the current date. In both cases, the extension
 * SHALL equal the specified renewal duration in months.
 *
 * **Validates: Requirements 2.5**
 */
describe('Property 6: Membership renewal extends from correct base date', () => {
  it('should extend active memberships from current end date', async () => {
    await fc.assert(
      fc.asyncProperty(durationArb, durationArb, async (originalDuration, renewalDuration) => {
        const fixedDate = new Date('2024-06-15');
        const membershipService = new MembershipService(() => fixedDate);

        const startDate = new Date('2024-06-01');
        const currentEndDate = addMonths(startDate, originalDuration);
        const expectedNewEndDate = addMonths(currentEndDate, renewalDuration);

        mockPrisma.membership.findUnique.mockResolvedValue({
          id: 'membership-1',
          memberId: 'member-uuid-1',
          startDate,
          endDate: currentEndDate,
          durationMonths: originalDuration,
          status: MembershipStatus.Active,
        });

        mockPrisma.membership.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'membership-1',
            memberId: 'member-uuid-1',
            startDate,
            ...data,
          })
        );

        const result = await membershipService.renew('membership-1', renewalDuration);

        // Should extend from current end date
        expect(result.endDate.getTime()).toBe(expectedNewEndDate.getTime());
        expect(result.status).toBe(MembershipStatus.Active);
      }),
      { numRuns: 100 }
    );
  });

  it('should extend expired memberships from current date', async () => {
    await fc.assert(
      fc.asyncProperty(durationArb, async (renewalDuration) => {
        const fixedDate = new Date('2024-06-15');
        const membershipService = new MembershipService(() => fixedDate);

        const expectedNewEndDate = addMonths(fixedDate, renewalDuration);

        mockPrisma.membership.findUnique.mockResolvedValue({
          id: 'membership-1',
          memberId: 'member-uuid-1',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-04-01'), // expired
          durationMonths: 3,
          status: MembershipStatus.Expired,
        });

        mockPrisma.membership.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'membership-1',
            memberId: 'member-uuid-1',
            ...data,
          })
        );

        const result = await membershipService.renew('membership-1', renewalDuration);

        // Should extend from current date (fixedDate)
        expect(result.endDate.getTime()).toBe(expectedNewEndDate.getTime());
        expect(result.status).toBe(MembershipStatus.Active);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: Membership status evaluation correctness ───────────────────

/**
 * Feature: gym-management, Property 7: Membership status evaluation correctness
 *
 * For any set of memberships with known start dates, end dates, and a configured
 * expiry window, running the daily status evaluation SHALL:
 * - Set status to Expiring_Soon for all memberships where 0 < (endDate - currentDate) <= expiryWindow
 * - Set status to Expired for all memberships where currentDate > endDate
 * - Leave status as Active for all memberships where (endDate - currentDate) > expiryWindow
 *
 * **Validates: Requirements 3.1, 3.2**
 */
describe('Property 7: Membership status evaluation correctness', () => {
  it('should correctly evaluate membership statuses based on end dates and expiry window', async () => {
    const expiryWindowArb = fc.integer({ min: 1, max: 30 });

    // Generate memberships with various end dates relative to a fixed "today"
    const membershipArb = fc.record({
      id: fc.uuid(),
      memberId: fc.uuid(),
      daysUntilEnd: fc.integer({ min: -30, max: 60 }), // negative = expired
      currentStatus: fc.constantFrom(MembershipStatus.Active, MembershipStatus.ExpiringSoon),
      memberMemberId: fc.stringOf(
        fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
        { minLength: 5, maxLength: 5 }
      ).map((s) => `GYM-${s}`),
    });

    const membershipSetArb = fc.array(membershipArb, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(membershipSetArb, expiryWindowArb, async (memberships, expiryWindow) => {
        const fixedDate = new Date('2024-06-15');
        const membershipService = new MembershipService(() => fixedDate);

        // Build mock memberships with calculated end dates
        const mockMemberships = memberships.map((m) => {
          const endDate = new Date(fixedDate);
          endDate.setDate(endDate.getDate() + m.daysUntilEnd);
          return {
            id: m.id,
            memberId: m.memberId,
            startDate: new Date('2024-01-01'),
            endDate,
            durationMonths: 3,
            status: m.currentStatus,
            member: { memberId: m.memberMemberId },
          };
        });

        mockPrisma.systemConfig.findUnique.mockResolvedValue({
          key: 'expiry_window_days',
          value: String(expiryWindow),
        });
        mockPrisma.membership.findMany.mockResolvedValue(mockMemberships);
        mockPrisma.membership.update.mockResolvedValue({});

        const result = await membershipService.evaluateStatuses();

        // Verify each membership was evaluated correctly
        const updateCalls = mockPrisma.membership.update.mock.calls;

        for (const m of mockMemberships) {
          const endDate = new Date(m.endDate);
          const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          const today = new Date(fixedDate.getFullYear(), fixedDate.getMonth(), fixedDate.getDate());
          const remainingMs = end.getTime() - today.getTime();
          const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

          if (remainingDays <= 0) {
            // Should be marked as Expired (if not already)
            if (m.status !== MembershipStatus.Expired) {
              const wasUpdated = updateCalls.some(
                (call: any) =>
                  call[0].where.id === m.id &&
                  call[0].data.status === MembershipStatus.Expired
              );
              expect(wasUpdated).toBe(true);
              expect(result.newlyExpired).toContain(m.member.memberId);
            }
          } else if (remainingDays <= expiryWindow) {
            // Should be marked as ExpiringSoon (if not already)
            if (m.status !== MembershipStatus.ExpiringSoon) {
              const wasUpdated = updateCalls.some(
                (call: any) =>
                  call[0].where.id === m.id &&
                  call[0].data.status === MembershipStatus.ExpiringSoon
              );
              expect(wasUpdated).toBe(true);
              expect(result.newlyExpiringSoon).toContain(m.member.memberId);
            }
          } else {
            // Should remain Active - no update for this membership
            const wasUpdated = updateCalls.some(
              (call: any) => call[0].where.id === m.id
            );
            expect(wasUpdated).toBe(false);
          }
        }

        expect(result.totalEvaluated).toBe(mockMemberships.length);
      }),
      { numRuns: 100 }
    );
  });
});
