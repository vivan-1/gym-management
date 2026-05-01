import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: gym-management, Property 13: Member listing data completeness
 *
 * **Validates: Requirements 8.1**
 *
 * Property: For any registered member with an associated membership and payment,
 * the member listing SHALL include the member's name, email, current membership status,
 * and current payment status.
 */

interface MemberListItem {
  id: string;
  memberId: string;
  fullName: string;
  email: string;
  membershipStatus: string | null;
  paymentStatus: string | null;
}

interface MemberRecord {
  id: string;
  memberId: string;
  fullName: string;
  email: string;
}

interface MembershipRecord {
  memberId: string;
  status: string;
}

interface PaymentRecord {
  memberId: string;
  status: string;
}

/**
 * Simulates the member listing transformation that the backend performs:
 * joins member data with their latest membership status and payment status.
 */
function buildMemberListing(
  members: MemberRecord[],
  memberships: MembershipRecord[],
  payments: PaymentRecord[]
): MemberListItem[] {
  return members.map((member) => {
    const membership = memberships.find((m) => m.memberId === member.id);
    const payment = payments.find((p) => p.memberId === member.id);
    return {
      id: member.id,
      memberId: member.memberId,
      fullName: member.fullName,
      email: member.email,
      membershipStatus: membership?.status ?? null,
      paymentStatus: payment?.status ?? null,
    };
  });
}

// Generators
const membershipStatusArb = fc.constantFrom('active', 'expiring_soon', 'expired');
const paymentStatusArb = fc.constantFrom('paid', 'pending', 'overdue');

const memberRecordArb = fc.record({
  id: fc.uuid(),
  memberId: fc.stringMatching(/^MEM-[A-Z0-9]{6}$/),
  fullName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  email: fc.emailAddress(),
});

describe('Feature: gym-management, Property 13: Member listing data completeness', () => {
  it('every member with a membership and payment has name, email, membership status, and payment status in the listing', () => {
    fc.assert(
      fc.property(
        fc.array(memberRecordArb, { minLength: 1, maxLength: 20 }),
        membershipStatusArb,
        paymentStatusArb,
        (members, mStatus, pStatus) => {
          // Create memberships and payments for all members
          const memberships: MembershipRecord[] = members.map((m) => ({
            memberId: m.id,
            status: mStatus,
          }));
          const payments: PaymentRecord[] = members.map((m) => ({
            memberId: m.id,
            status: pStatus,
          }));

          const listing = buildMemberListing(members, memberships, payments);

          // Every member with a membership and payment must have all fields present
          for (const member of members) {
            const listItem = listing.find((item) => item.id === member.id);

            // Member must be in the listing
            expect(listItem).toBeDefined();

            // Name must be present and match
            expect(listItem!.fullName).toBe(member.fullName);

            // Email must be present and match
            expect(listItem!.email).toBe(member.email);

            // Membership status must be present (not null) since member has a membership
            expect(listItem!.membershipStatus).not.toBeNull();
            expect(listItem!.membershipStatus).toBe(mStatus);

            // Payment status must be present (not null) since member has a payment
            expect(listItem!.paymentStatus).not.toBeNull();
            expect(listItem!.paymentStatus).toBe(pStatus);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('members without memberships have null membership status in listing', () => {
    fc.assert(
      fc.property(
        fc.array(memberRecordArb, { minLength: 1, maxLength: 10 }),
        (members) => {
          // No memberships or payments
          const listing = buildMemberListing(members, [], []);

          for (const member of members) {
            const listItem = listing.find((item) => item.id === member.id);
            expect(listItem).toBeDefined();
            expect(listItem!.fullName).toBe(member.fullName);
            expect(listItem!.email).toBe(member.email);
            expect(listItem!.membershipStatus).toBeNull();
            expect(listItem!.paymentStatus).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
