import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { MemberService, MemberServiceError } from './member.service';
import { Gender, MembershipStatus, PaymentStatus } from '../types/enums';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

const mockPrisma = prisma as unknown as {
  member: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

// ─── Generators ─────────────────────────────────────────────────────────────

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

const emailArb = fc
  .record({
    local: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
      minLength: 1,
      maxLength: 15,
    }),
    domain: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
      minLength: 2,
      maxLength: 10,
    }),
    tld: fc.constantFrom('com', 'org', 'net', 'io'),
  })
  .map(({ local, domain, tld }) => `${local}@${domain}.${tld}`);

const phoneArb = fc
  .record({
    prefix: fc.constantFrom('+1', '+44', '+91', '+61'),
    number: fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
      minLength: 7,
      maxLength: 10,
    }),
  })
  .map(({ prefix, number }) => `${prefix}${number}`);

const genderArb = fc.constantFrom(Gender.Male, Gender.Female, Gender.Other);

const dateOfBirthArb = fc.date({
  min: new Date('1950-01-01'),
  max: new Date('2005-12-31'),
});

const validRegistrationArb = fc.record({
  fullName: nonEmptyStringArb,
  email: emailArb,
  phone: phoneArb,
  dateOfBirth: dateOfBirthArb,
  gender: genderArb,
  address: nonEmptyStringArb,
});

// ─── Property 1: Member registration creates a unique record ────────────────

/**
 * Feature: gym-management, Property 1: Member registration creates a unique record
 *
 * For any valid member registration input, registering the member SHALL produce
 * a new Member record with a unique member ID that is distinct from all previously assigned IDs.
 *
 * **Validates: Requirements 1.2**
 */
describe('Property 1: Member registration creates a unique record', () => {
  let memberService: MemberService;

  beforeEach(() => {
    vi.clearAllMocks();
    memberService = new MemberService();
  });

  it('should produce a unique member ID for every valid registration', async () => {
    const generatedIds = new Set<string>();

    await fc.assert(
      fc.asyncProperty(validRegistrationArb, async (input) => {
        // Mock: no duplicate email, no memberId collision
        mockPrisma.member.findUnique.mockResolvedValue(null);

        let capturedMemberId = '';
        mockPrisma.member.create.mockImplementation(({ data }: { data: { memberId: string } }) => {
          capturedMemberId = data.memberId;
          return Promise.resolve({
            id: `uuid-${Date.now()}-${Math.random()}`,
            memberId: data.memberId,
            ...input,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });

        const result = await memberService.register(input);

        // The member ID should match GYM-XXXXX format
        expect(result.memberId).toMatch(/^GYM-[A-Z0-9]{5}$/);

        // The member ID should be distinct from all previously generated IDs
        expect(generatedIds.has(capturedMemberId)).toBe(false);
        generatedIds.add(capturedMemberId);
      }),
      { numRuns: 100 }
    );
  });

  it('should always create a member record on valid input', async () => {
    await fc.assert(
      fc.asyncProperty(validRegistrationArb, async (input) => {
        // Reset mocks between iterations
        mockPrisma.member.findUnique.mockReset();
        mockPrisma.member.create.mockReset();

        mockPrisma.member.findUnique.mockResolvedValue(null);
        mockPrisma.member.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          return Promise.resolve({
            id: `uuid-${Math.random()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });

        const result = await memberService.register(input);

        // A member record should always be created
        expect(result).toBeDefined();
        expect(result.memberId).toBeDefined();
        expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: Registration validation rejects missing required fields ────

/**
 * Feature: gym-management, Property 2: Registration validation rejects missing required fields
 *
 * For any registration input where one or more required fields are missing or empty,
 * the system SHALL reject the registration and return validation errors that identify
 * exactly the missing fields.
 *
 * **Validates: Requirements 1.3**
 */
describe('Property 2: Registration validation rejects missing required fields', () => {
  let memberService: MemberService;

  beforeEach(() => {
    vi.clearAllMocks();
    memberService = new MemberService();
  });

  const requiredFields = ['fullName', 'email', 'phone', 'dateOfBirth', 'gender', 'address'] as const;

  /**
   * Generator that produces an input with at least one required field missing/empty.
   * Returns the input and which fields were emptied.
   */
  const invalidInputArb = fc
    .record({
      base: validRegistrationArb,
      fieldsToEmpty: fc.subarray(
        [...requiredFields],
        { minLength: 1, maxLength: requiredFields.length }
      ),
    })
    .map(({ base, fieldsToEmpty }) => {
      const input: Record<string, unknown> = { ...base };
      for (const field of fieldsToEmpty) {
        if (field === 'dateOfBirth') {
          input[field] = undefined;
        } else if (field === 'gender') {
          input[field] = undefined;
        } else {
          input[field] = '';
        }
      }
      return { input, emptiedFields: fieldsToEmpty };
    });

  it('should reject registration with missing/empty required fields and identify them', async () => {
    await fc.assert(
      fc.asyncProperty(invalidInputArb, async ({ input, emptiedFields }) => {
        try {
          await memberService.register(input as any);
          expect.fail('Registration should have been rejected for missing fields');
        } catch (error) {
          expect(error).toBeInstanceOf(MemberServiceError);
          const serviceError = error as MemberServiceError;
          expect(serviceError.statusCode).toBe(400);

          // The error message should reference the missing fields
          for (const field of emptiedFields) {
            expect(serviceError.message.toLowerCase()).toContain(field.toLowerCase());
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should never call prisma.create when validation fails', async () => {
    await fc.assert(
      fc.asyncProperty(invalidInputArb, async ({ input }) => {
        try {
          await memberService.register(input as any);
        } catch {
          // Expected to throw
        }

        // Prisma create should never be called for invalid input
        expect(mockPrisma.member.create).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Duplicate email rejection ──────────────────────────────────

/**
 * Feature: gym-management, Property 3: Duplicate email rejection
 *
 * For any successfully registered member, attempting to register a new member
 * with the same email address SHALL be rejected with a duplicate email error,
 * regardless of other field values.
 *
 * **Validates: Requirements 1.4**
 */
describe('Property 3: Duplicate email rejection', () => {
  let memberService: MemberService;

  beforeEach(() => {
    vi.clearAllMocks();
    memberService = new MemberService();
  });

  it('should reject registration when email already exists regardless of other fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationArb,
        validRegistrationArb,
        async (firstInput, secondInput) => {
          // Use the same email for both registrations
          const sharedEmail = firstInput.email;
          const secondWithSameEmail = { ...secondInput, email: sharedEmail };

          // Mock: email check returns an existing member (duplicate)
          const existingMember = {
            id: 'existing-uuid',
            memberId: 'GYM-EXIST',
            ...firstInput,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          mockPrisma.member.findUnique.mockResolvedValue(existingMember);

          try {
            await memberService.register(secondWithSameEmail);
            expect.fail('Registration should have been rejected for duplicate email');
          } catch (error) {
            expect(error).toBeInstanceOf(MemberServiceError);
            const serviceError = error as MemberServiceError;
            expect(serviceError.statusCode).toBe(409);
            expect(serviceError.message.toLowerCase()).toContain('email');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never create a record when email is duplicate', async () => {
    await fc.assert(
      fc.asyncProperty(validRegistrationArb, async (input) => {
        // Mock: email already exists
        mockPrisma.member.findUnique.mockResolvedValue({
          id: 'existing-uuid',
          memberId: 'GYM-EXIST',
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        try {
          await memberService.register(input);
        } catch {
          // Expected to throw
        }

        expect(mockPrisma.member.create).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 14: Member search matches by name, email, or member ID ────────

/**
 * Feature: gym-management, Property 14: Member search matches by name, email, or member ID
 *
 * For any search query string and set of registered members, the search results SHALL
 * include all members whose name, email, or member ID contains the search query
 * (case-insensitive), and SHALL exclude all members where none of these fields match.
 *
 * **Validates: Requirements 8.2**
 */
describe('Property 14: Member search matches by name, email, or member ID', () => {
  let memberService: MemberService;

  beforeEach(() => {
    vi.clearAllMocks();
    memberService = new MemberService();
  });

  /**
   * Generator for a set of members with known fields
   */
  const memberSetArb = fc.array(
    fc.record({
      id: fc.uuid(),
      memberId: fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
        minLength: 5,
        maxLength: 5,
      }).map((s) => `GYM-${s}`),
      fullName: nonEmptyStringArb,
      email: emailArb,
      memberships: fc.constant([]),
      payments: fc.constant([]),
    }),
    { minLength: 1, maxLength: 10 }
  );

  it('should include all members matching the query in name, email, or member ID (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(memberSetArb, async (members) => {
        // Pick a random member and extract a substring from one of their searchable fields
        const targetMember = members[0];
        const searchableFields = [targetMember.fullName, targetMember.email, targetMember.memberId];
        const chosenField = searchableFields[Math.floor(Math.random() * searchableFields.length)];
        // Use a substring of the chosen field as the search term
        const startIdx = 0;
        const endIdx = Math.max(1, Math.floor(chosenField.length / 2));
        const searchTerm = chosenField.substring(startIdx, endIdx);

        if (searchTerm.length === 0) return; // skip if empty

        const lowerTerm = searchTerm.toLowerCase();

        // Determine which members should match
        const expectedMatches = members.filter(
          (m) =>
            m.fullName.toLowerCase().includes(lowerTerm) ||
            m.email.toLowerCase().includes(lowerTerm) ||
            m.memberId.toLowerCase().includes(lowerTerm)
        );

        // Mock prisma to return the expected matches
        mockPrisma.member.findMany.mockResolvedValue(expectedMatches);
        mockPrisma.member.count.mockResolvedValue(expectedMatches.length);

        const result = await memberService.search({
          term: searchTerm,
          pagination: { page: 1, pageSize: 100 },
        });

        // Verify the search was called with the lowercased term
        expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: [
                { fullName: { contains: lowerTerm } },
                { email: { contains: lowerTerm } },
                { memberId: { contains: lowerTerm } },
              ],
            }),
          })
        );

        // All returned results should match the search term in at least one field
        for (const item of result.data) {
          const matchesName = item.fullName.toLowerCase().includes(lowerTerm);
          const matchesEmail = item.email.toLowerCase().includes(lowerTerm);
          const matchesMemberId = item.memberId.toLowerCase().includes(lowerTerm);
          expect(matchesName || matchesEmail || matchesMemberId).toBe(true);
        }

        // The count of results should match expected
        expect(result.data.length).toBe(expectedMatches.length);
      }),
      { numRuns: 100 }
    );
  });

  it('should exclude members where none of the searchable fields match', async () => {
    await fc.assert(
      fc.asyncProperty(memberSetArb, async (members) => {
        // Use a search term that won't match any member
        const searchTerm = 'zzz_no_match_xyz_999';
        const lowerTerm = searchTerm.toLowerCase();

        // Verify none of the members match
        const matches = members.filter(
          (m) =>
            m.fullName.toLowerCase().includes(lowerTerm) ||
            m.email.toLowerCase().includes(lowerTerm) ||
            m.memberId.toLowerCase().includes(lowerTerm)
        );

        // Mock prisma to return no results (since nothing matches)
        mockPrisma.member.findMany.mockResolvedValue([]);
        mockPrisma.member.count.mockResolvedValue(0);

        const result = await memberService.search({
          term: searchTerm,
          pagination: { page: 1, pageSize: 100 },
        });

        // No results should be returned
        expect(result.data.length).toBe(0);
        expect(matches.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 15: Member filtering by status ────────────────────────────────

/**
 * Feature: gym-management, Property 15: Member filtering by status
 *
 * For any set of registered members and any selected membership status or payment status filter,
 * the filtered results SHALL contain exactly the members whose corresponding status matches
 * the filter, with no omissions and no false inclusions.
 *
 * **Validates: Requirements 7.2, 8.3, 8.4**
 */
describe('Property 15: Member filtering by status', () => {
  let memberService: MemberService;

  beforeEach(() => {
    vi.clearAllMocks();
    memberService = new MemberService();
  });

  const membershipStatusArb = fc.constantFrom(
    MembershipStatus.Active,
    MembershipStatus.ExpiringSoon,
    MembershipStatus.Expired
  );

  const paymentStatusArb = fc.constantFrom(
    PaymentStatus.Paid,
    PaymentStatus.Pending,
    PaymentStatus.Overdue
  );

  /**
   * Generator for members with known membership and payment statuses
   */
  const memberWithStatusArb = fc.record({
    id: fc.uuid(),
    memberId: fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
      minLength: 5,
      maxLength: 5,
    }).map((s) => `GYM-${s}`),
    fullName: nonEmptyStringArb,
    email: emailArb,
    membershipStatus: fc.oneof(membershipStatusArb, fc.constant(null)),
    paymentStatus: fc.oneof(paymentStatusArb, fc.constant(null)),
  });

  const memberSetWithStatusArb = fc.array(memberWithStatusArb, { minLength: 1, maxLength: 15 });

  it('should return exactly the members matching the membership status filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberSetWithStatusArb,
        membershipStatusArb,
        async (members, filterStatus) => {
          // Determine which members should match the filter
          const expectedMatches = members.filter(
            (m) => m.membershipStatus === filterStatus
          );

          // Build mock data with memberships array for prisma response
          const mockResults = expectedMatches.map((m) => ({
            id: m.id,
            memberId: m.memberId,
            fullName: m.fullName,
            email: m.email,
            memberships: m.membershipStatus ? [{ status: m.membershipStatus }] : [],
            payments: m.paymentStatus ? [{ status: m.paymentStatus }] : [],
          }));

          mockPrisma.member.findMany.mockResolvedValue(mockResults);
          mockPrisma.member.count.mockResolvedValue(mockResults.length);

          const result = await memberService.list(
            { membershipStatus: filterStatus },
            { page: 1, pageSize: 100 }
          );

          // Verify the filter was passed to prisma
          expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                memberships: { some: { status: filterStatus } },
              }),
            })
          );

          // All returned members should have the matching membership status
          for (const item of result.data) {
            expect(item.membershipStatus).toBe(filterStatus);
          }

          // The count should match expected
          expect(result.data.length).toBe(expectedMatches.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return exactly the members matching the payment status filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberSetWithStatusArb,
        paymentStatusArb,
        async (members, filterStatus) => {
          // Determine which members should match the filter
          const expectedMatches = members.filter(
            (m) => m.paymentStatus === filterStatus
          );

          // Build mock data
          const mockResults = expectedMatches.map((m) => ({
            id: m.id,
            memberId: m.memberId,
            fullName: m.fullName,
            email: m.email,
            memberships: m.membershipStatus ? [{ status: m.membershipStatus }] : [],
            payments: m.paymentStatus ? [{ status: m.paymentStatus }] : [],
          }));

          mockPrisma.member.findMany.mockResolvedValue(mockResults);
          mockPrisma.member.count.mockResolvedValue(mockResults.length);

          const result = await memberService.list(
            { paymentStatus: filterStatus },
            { page: 1, pageSize: 100 }
          );

          // Verify the filter was passed to prisma
          expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                payments: { some: { status: filterStatus } },
              }),
            })
          );

          // All returned members should have the matching payment status
          for (const item of result.data) {
            expect(item.paymentStatus).toBe(filterStatus);
          }

          // The count should match expected
          expect(result.data.length).toBe(expectedMatches.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return exactly the members matching both membership and payment status filters', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberSetWithStatusArb,
        membershipStatusArb,
        paymentStatusArb,
        async (members, membershipFilter, paymentFilter) => {
          // Determine which members should match both filters
          const expectedMatches = members.filter(
            (m) =>
              m.membershipStatus === membershipFilter &&
              m.paymentStatus === paymentFilter
          );

          // Build mock data
          const mockResults = expectedMatches.map((m) => ({
            id: m.id,
            memberId: m.memberId,
            fullName: m.fullName,
            email: m.email,
            memberships: m.membershipStatus ? [{ status: m.membershipStatus }] : [],
            payments: m.paymentStatus ? [{ status: m.paymentStatus }] : [],
          }));

          mockPrisma.member.findMany.mockResolvedValue(mockResults);
          mockPrisma.member.count.mockResolvedValue(mockResults.length);

          const result = await memberService.list(
            { membershipStatus: membershipFilter, paymentStatus: paymentFilter },
            { page: 1, pageSize: 100 }
          );

          // Verify both filters were passed to prisma
          expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                memberships: { some: { status: membershipFilter } },
                payments: { some: { status: paymentFilter } },
              }),
            })
          );

          // All returned members should match both filters
          for (const item of result.data) {
            expect(item.membershipStatus).toBe(membershipFilter);
            expect(item.paymentStatus).toBe(paymentFilter);
          }

          expect(result.data.length).toBe(expectedMatches.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
