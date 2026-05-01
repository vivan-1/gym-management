import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemberService, MemberServiceError } from './member.service';
import { Gender } from '../types/enums';

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

describe('MemberService', () => {
  let memberService: MemberService;

  const validRegistrationInput = {
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    dateOfBirth: new Date('1990-01-15'),
    gender: Gender.Male,
    address: '123 Main St, City',
  };

  const mockMember = {
    id: 'uuid-1',
    memberId: 'GYM-AB12C',
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    dateOfBirth: new Date('1990-01-15'),
    gender: 'male',
    address: '123 Main St, City',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    memberService = new MemberService();
  });

  describe('register', () => {
    it('should create a new member with a unique member ID', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue(mockMember);

      const result = await memberService.register(validRegistrationInput);

      expect(result).toEqual(mockMember);
      expect(mockPrisma.member.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fullName: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          gender: 'male',
          address: '123 Main St, City',
          memberId: expect.stringMatching(/^GYM-[A-Z0-9]{5}$/),
        }),
      });
    });

    it('should throw 400 for missing required fields', async () => {
      const invalidInput = {
        fullName: '',
        email: 'john@example.com',
        phone: '+1234567890',
        dateOfBirth: new Date('1990-01-15'),
        gender: Gender.Male,
        address: '123 Main St',
      };

      await expect(memberService.register(invalidInput)).rejects.toThrow(
        MemberServiceError
      );
      await expect(memberService.register(invalidInput)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should throw 400 for invalid email format', async () => {
      const invalidInput = {
        ...validRegistrationInput,
        email: 'not-an-email',
      };

      await expect(memberService.register(invalidInput)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should throw 409 for duplicate email', async () => {
      // First findUnique call is for email check — return existing member
      mockPrisma.member.findUnique.mockResolvedValueOnce(mockMember);

      await expect(
        memberService.register(validRegistrationInput)
      ).rejects.toThrow(MemberServiceError);
      
      // Reset and test again for status code
      mockPrisma.member.findUnique.mockResolvedValueOnce(mockMember);
      await expect(
        memberService.register(validRegistrationInput)
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('should generate member ID in GYM-XXXXX format', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      mockPrisma.member.create.mockImplementation(({ data }) => {
        return Promise.resolve({ ...mockMember, memberId: data.memberId });
      });

      const result = await memberService.register(validRegistrationInput);

      expect(result.memberId).toMatch(/^GYM-[A-Z0-9]{5}$/);
    });

    it('should retry member ID generation on collision', async () => {
      // First call: email check (no duplicate)
      // Second call: memberId check (collision)
      // Third call: memberId check (no collision)
      mockPrisma.member.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(mockMember) // first memberId collision
        .mockResolvedValueOnce(null); // second memberId is unique
      mockPrisma.member.create.mockResolvedValue(mockMember);

      const result = await memberService.register(validRegistrationInput);

      expect(result).toEqual(mockMember);
      // findUnique should have been called 3 times: 1 email + 2 memberId checks
      expect(mockPrisma.member.findUnique).toHaveBeenCalledTimes(3);
    });
  });

  describe('getById', () => {
    it('should return member with membership and payment info', async () => {
      const memberWithRelations = {
        ...mockMember,
        memberships: [
          {
            id: 'membership-1',
            status: 'active',
            startDate: new Date(),
            endDate: new Date(),
            payments: [{ id: 'payment-1', status: 'paid' }],
          },
        ],
      };
      mockPrisma.member.findUnique.mockResolvedValue(memberWithRelations);

      const result = await memberService.getById('GYM-AB12C');

      expect(result).toEqual(memberWithRelations);
      expect(mockPrisma.member.findUnique).toHaveBeenCalledWith({
        where: { memberId: 'GYM-AB12C' },
        include: {
          memberships: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              payments: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });
    });

    it('should throw 404 when member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);

      await expect(
        memberService.getById('GYM-XXXXX')
      ).rejects.toThrow(MemberServiceError);

      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(
        memberService.getById('GYM-XXXXX')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('search', () => {
    const mockMembers = [
      {
        id: 'uuid-1',
        memberId: 'GYM-AB12C',
        fullName: 'John Doe',
        email: 'john@example.com',
        memberships: [{ status: 'active' }],
        payments: [{ status: 'paid' }],
      },
    ];

    it('should search members by term with pagination', async () => {
      mockPrisma.member.findMany.mockResolvedValue(mockMembers);
      mockPrisma.member.count.mockResolvedValue(1);

      const result = await memberService.search({
        term: 'john',
        pagination: { page: 1, pageSize: 20 },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].fullName).toBe('John Doe');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should apply membership status filter', async () => {
      mockPrisma.member.findMany.mockResolvedValue(mockMembers);
      mockPrisma.member.count.mockResolvedValue(1);

      await memberService.search({
        term: 'john',
        membershipStatus: 'active' as any,
        pagination: { page: 1, pageSize: 20 },
      });

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberships: { some: { status: 'active' } },
          }),
        })
      );
    });

    it('should apply payment status filter', async () => {
      mockPrisma.member.findMany.mockResolvedValue(mockMembers);
      mockPrisma.member.count.mockResolvedValue(1);

      await memberService.search({
        term: 'john',
        paymentStatus: 'paid' as any,
        pagination: { page: 1, pageSize: 20 },
      });

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payments: { some: { status: 'paid' } },
          }),
        })
      );
    });

    it('should calculate correct pagination offset', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await memberService.search({
        term: 'test',
        pagination: { page: 3, pageSize: 10 },
      });

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
    });

    it('should calculate totalPages correctly', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(25);

      const result = await memberService.search({
        term: 'test',
        pagination: { page: 1, pageSize: 10 },
      });

      expect(result.totalPages).toBe(3);
    });
  });

  describe('list', () => {
    const mockMembers = [
      {
        id: 'uuid-1',
        memberId: 'GYM-AB12C',
        fullName: 'John Doe',
        email: 'john@example.com',
        memberships: [{ status: 'active' }],
        payments: [{ status: 'paid' }],
      },
      {
        id: 'uuid-2',
        memberId: 'GYM-DE34F',
        fullName: 'Jane Smith',
        email: 'jane@example.com',
        memberships: [],
        payments: [],
      },
    ];

    it('should list all members with pagination when no filters', async () => {
      mockPrisma.member.findMany.mockResolvedValue(mockMembers);
      mockPrisma.member.count.mockResolvedValue(2);

      const result = await memberService.list(
        {},
        { page: 1, pageSize: 20 }
      );

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should return null for membershipStatus when no membership exists', async () => {
      mockPrisma.member.findMany.mockResolvedValue([mockMembers[1]]);
      mockPrisma.member.count.mockResolvedValue(1);

      const result = await memberService.list(
        {},
        { page: 1, pageSize: 20 }
      );

      expect(result.data[0].membershipStatus).toBeNull();
      expect(result.data[0].paymentStatus).toBeNull();
    });

    it('should filter by membership status', async () => {
      mockPrisma.member.findMany.mockResolvedValue([mockMembers[0]]);
      mockPrisma.member.count.mockResolvedValue(1);

      await memberService.list(
        { membershipStatus: 'active' as any },
        { page: 1, pageSize: 20 }
      );

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberships: { some: { status: 'active' } },
          }),
        })
      );
    });

    it('should filter by payment status', async () => {
      mockPrisma.member.findMany.mockResolvedValue([mockMembers[0]]);
      mockPrisma.member.count.mockResolvedValue(1);

      await memberService.list(
        { paymentStatus: 'overdue' as any },
        { page: 1, pageSize: 20 }
      );

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payments: { some: { status: 'overdue' } },
          }),
        })
      );
    });

    it('should apply both filters simultaneously', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await memberService.list(
        { membershipStatus: 'expired' as any, paymentStatus: 'overdue' as any },
        { page: 1, pageSize: 20 }
      );

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberships: { some: { status: 'expired' } },
            payments: { some: { status: 'overdue' } },
          }),
        })
      );
    });

    it('should map member data to MemberListItem format', async () => {
      mockPrisma.member.findMany.mockResolvedValue([mockMembers[0]]);
      mockPrisma.member.count.mockResolvedValue(1);

      const result = await memberService.list(
        {},
        { page: 1, pageSize: 20 }
      );

      expect(result.data[0]).toEqual({
        id: 'uuid-1',
        memberId: 'GYM-AB12C',
        fullName: 'John Doe',
        email: 'john@example.com',
        membershipStatus: 'active',
        paymentStatus: 'paid',
      });
    });
  });
});
