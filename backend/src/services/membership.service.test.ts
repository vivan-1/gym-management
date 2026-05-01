import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MembershipService, MembershipServiceError, addMonths } from './membership.service';
import { MembershipStatus } from '../types/enums';

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

describe('MembershipService', () => {
  let membershipService: MembershipService;
  const fixedDate = new Date('2024-06-15');

  const mockMember = {
    id: 'member-uuid-1',
    memberId: 'GYM-AB12C',
    fullName: 'John Doe',
    email: 'john@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    membershipService = new MembershipService(() => fixedDate);
  });

  describe('addMonths', () => {
    it('should add months correctly for standard dates', () => {
      const date = new Date('2024-01-15');
      expect(addMonths(date, 1).toISOString().slice(0, 10)).toBe('2024-02-15');
      expect(addMonths(date, 3).toISOString().slice(0, 10)).toBe('2024-04-15');
      expect(addMonths(date, 6).toISOString().slice(0, 10)).toBe('2024-07-15');
      expect(addMonths(date, 12).toISOString().slice(0, 10)).toBe('2025-01-15');
    });

    it('should handle month-end overflow (Jan 31 + 1 month = Feb 28/29)', () => {
      const jan31 = new Date('2024-01-31');
      // 2024 is a leap year, so Feb has 29 days
      expect(addMonths(jan31, 1).toISOString().slice(0, 10)).toBe('2024-02-29');
    });

    it('should handle non-leap year month-end overflow', () => {
      const jan31 = new Date('2023-01-31');
      expect(addMonths(jan31, 1).toISOString().slice(0, 10)).toBe('2023-02-28');
    });

    it('should handle adding 12 months (full year)', () => {
      const date = new Date('2024-03-15');
      expect(addMonths(date, 12).toISOString().slice(0, 10)).toBe('2025-03-15');
    });
  });

  describe('create', () => {
    it('should create a membership with calculated end date and Active status', async () => {
      const startDate = new Date('2024-06-01');
      const expectedEndDate = new Date('2024-09-01');

      mockPrisma.member.findUnique.mockResolvedValue(mockMember);
      mockPrisma.membership.create.mockResolvedValue({
        id: 'membership-1',
        memberId: mockMember.id,
        startDate,
        endDate: expectedEndDate,
        durationMonths: 3,
        status: MembershipStatus.Active,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await membershipService.create(mockMember.id, {
        startDate,
        duration: 3,
      });

      expect(result.status).toBe(MembershipStatus.Active);
      expect(mockPrisma.membership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberId: mockMember.id,
          startDate,
          endDate: expectedEndDate,
          durationMonths: 3,
          status: MembershipStatus.Active,
        }),
      });
    });

    it('should set status to Expired if end date is in the past', async () => {
      const startDate = new Date('2024-01-01');

      mockPrisma.member.findUnique.mockResolvedValue(mockMember);
      mockPrisma.membership.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'membership-1',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await membershipService.create(mockMember.id, {
        startDate,
        duration: 3, // ends 2024-04-01, before fixedDate 2024-06-15
      });

      expect(result.status).toBe(MembershipStatus.Expired);
    });

    it('should throw 404 if member does not exist', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);

      await expect(
        membershipService.create('non-existent-id', {
          startDate: new Date('2024-06-01'),
          duration: 3,
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Member not found',
      });
    });

    it('should throw 400 for invalid duration', async () => {
      await expect(
        membershipService.create(mockMember.id, {
          startDate: new Date('2024-06-01'),
          duration: 5 as any,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('renew', () => {
    it('should extend from current end date for active membership', async () => {
      const currentEndDate = new Date('2024-09-01');
      const expectedNewEndDate = addMonths(currentEndDate, 3);

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership-1',
        memberId: mockMember.id,
        startDate: new Date('2024-06-01'),
        endDate: currentEndDate,
        durationMonths: 3,
        status: MembershipStatus.Active,
      });
      mockPrisma.membership.update.mockResolvedValue({
        id: 'membership-1',
        memberId: mockMember.id,
        startDate: new Date('2024-06-01'),
        endDate: expectedNewEndDate,
        durationMonths: 3,
        status: MembershipStatus.Active,
      });

      const result = await membershipService.renew('membership-1', 3);

      expect(result.status).toBe(MembershipStatus.Active);
      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'membership-1' },
        data: {
          endDate: expectedNewEndDate,
          durationMonths: 3,
          status: MembershipStatus.Active,
        },
      });
    });

    it('should extend from current date for expired membership', async () => {
      const expectedNewEndDate = addMonths(fixedDate, 6);

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership-1',
        memberId: mockMember.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-04-01'),
        durationMonths: 3,
        status: MembershipStatus.Expired,
      });
      mockPrisma.membership.update.mockResolvedValue({
        id: 'membership-1',
        memberId: mockMember.id,
        endDate: expectedNewEndDate,
        durationMonths: 6,
        status: MembershipStatus.Active,
      });

      const result = await membershipService.renew('membership-1', 6);

      expect(result.status).toBe(MembershipStatus.Active);
      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'membership-1' },
        data: {
          endDate: expectedNewEndDate,
          durationMonths: 6,
          status: MembershipStatus.Active,
        },
      });
    });

    it('should extend from current end date for expiring_soon membership', async () => {
      const currentEndDate = new Date('2024-06-20'); // 5 days from fixedDate
      const expectedNewEndDate = addMonths(currentEndDate, 1);

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership-1',
        memberId: mockMember.id,
        startDate: new Date('2024-05-20'),
        endDate: currentEndDate,
        durationMonths: 1,
        status: MembershipStatus.ExpiringSoon,
      });
      mockPrisma.membership.update.mockResolvedValue({
        id: 'membership-1',
        memberId: mockMember.id,
        endDate: expectedNewEndDate,
        durationMonths: 1,
        status: MembershipStatus.Active,
      });

      const result = await membershipService.renew('membership-1', 1);

      expect(result.status).toBe(MembershipStatus.Active);
      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'membership-1' },
        data: {
          endDate: expectedNewEndDate,
          durationMonths: 1,
          status: MembershipStatus.Active,
        },
      });
    });

    it('should throw 404 if membership does not exist', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        membershipService.renew('non-existent-id', 3)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Membership not found',
      });
    });

    it('should throw 400 for invalid duration', async () => {
      await expect(
        membershipService.renew('membership-1', 5 as any)
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('evaluateStatuses', () => {
    it('should set memberships to Expired when past end date', async () => {
      mockPrisma.systemConfig.findUnique.mockResolvedValue({
        key: 'expiry_window_days',
        value: '7',
      });
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          memberId: mockMember.id,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-06-14'), // yesterday relative to fixedDate
          status: MembershipStatus.Active,
          member: { memberId: 'GYM-AB12C' },
        },
      ]);
      mockPrisma.membership.update.mockResolvedValue({});

      const result = await membershipService.evaluateStatuses();

      expect(result.newlyExpired).toContain('GYM-AB12C');
      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'membership-1' },
        data: { status: MembershipStatus.Expired },
      });
    });

    it('should set memberships to Expiring_Soon when within expiry window', async () => {
      mockPrisma.systemConfig.findUnique.mockResolvedValue({
        key: 'expiry_window_days',
        value: '7',
      });
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'membership-2',
          memberId: mockMember.id,
          startDate: new Date('2024-03-20'),
          endDate: new Date('2024-06-20'), // 5 days from fixedDate, within 7-day window
          status: MembershipStatus.Active,
          member: { memberId: 'GYM-DE34F' },
        },
      ]);
      mockPrisma.membership.update.mockResolvedValue({});

      const result = await membershipService.evaluateStatuses();

      expect(result.newlyExpiringSoon).toContain('GYM-DE34F');
      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'membership-2' },
        data: { status: MembershipStatus.ExpiringSoon },
      });
    });

    it('should not change status for memberships well beyond expiry window', async () => {
      mockPrisma.systemConfig.findUnique.mockResolvedValue({
        key: 'expiry_window_days',
        value: '7',
      });
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'membership-3',
          memberId: mockMember.id,
          startDate: new Date('2024-06-01'),
          endDate: new Date('2024-09-01'), // 78 days from fixedDate
          status: MembershipStatus.Active,
          member: { memberId: 'GYM-GH56I' },
        },
      ]);

      const result = await membershipService.evaluateStatuses();

      expect(result.newlyExpiringSoon).toHaveLength(0);
      expect(result.newlyExpired).toHaveLength(0);
      expect(mockPrisma.membership.update).not.toHaveBeenCalled();
    });

    it('should use default expiry window of 7 days when not configured', async () => {
      mockPrisma.systemConfig.findUnique.mockResolvedValue(null);
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'membership-4',
          memberId: mockMember.id,
          startDate: new Date('2024-03-20'),
          endDate: new Date('2024-06-20'), // 5 days from fixedDate
          status: MembershipStatus.Active,
          member: { memberId: 'GYM-JK78L' },
        },
      ]);
      mockPrisma.membership.update.mockResolvedValue({});

      const result = await membershipService.evaluateStatuses();

      expect(result.newlyExpiringSoon).toContain('GYM-JK78L');
    });

    it('should not re-mark already expiring_soon memberships', async () => {
      mockPrisma.systemConfig.findUnique.mockResolvedValue({
        key: 'expiry_window_days',
        value: '7',
      });
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'membership-5',
          memberId: mockMember.id,
          startDate: new Date('2024-03-20'),
          endDate: new Date('2024-06-20'),
          status: MembershipStatus.ExpiringSoon, // already marked
          member: { memberId: 'GYM-MN90P' },
        },
      ]);

      const result = await membershipService.evaluateStatuses();

      expect(result.newlyExpiringSoon).toHaveLength(0);
      expect(mockPrisma.membership.update).not.toHaveBeenCalled();
    });

    it('should return totalEvaluated count', async () => {
      mockPrisma.systemConfig.findUnique.mockResolvedValue(null);
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'membership-a',
          endDate: new Date('2024-09-01'),
          status: MembershipStatus.Active,
          member: { memberId: 'GYM-A' },
        },
        {
          id: 'membership-b',
          endDate: new Date('2024-09-01'),
          status: MembershipStatus.Active,
          member: { memberId: 'GYM-B' },
        },
      ]);

      const result = await membershipService.evaluateStatuses();

      expect(result.totalEvaluated).toBe(2);
    });
  });

  describe('getByMemberId', () => {
    it('should return the most recent membership for a member', async () => {
      const mockMembership = {
        id: 'membership-1',
        memberId: mockMember.id,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-09-01'),
        durationMonths: 3,
        status: MembershipStatus.Active,
        payments: [],
      };
      mockPrisma.membership.findFirst.mockResolvedValue(mockMembership);

      const result = await membershipService.getByMemberId(mockMember.id);

      expect(result).toEqual(mockMembership);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: { memberId: mockMember.id },
        orderBy: { createdAt: 'desc' },
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });

    it('should return null when no membership exists', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      const result = await membershipService.getByMemberId('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getStatusCounts', () => {
    it('should return counts for all statuses', async () => {
      mockPrisma.membership.count
        .mockResolvedValueOnce(10) // active
        .mockResolvedValueOnce(3) // expiringSoon
        .mockResolvedValueOnce(5); // expired

      const result = await membershipService.getStatusCounts();

      expect(result).toEqual({
        active: 10,
        expiringSoon: 3,
        expired: 5,
      });
    });

    it('should return zeros when no memberships exist', async () => {
      mockPrisma.membership.count.mockResolvedValue(0);

      const result = await membershipService.getStatusCounts();

      expect(result).toEqual({
        active: 0,
        expiringSoon: 0,
        expired: 0,
      });
    });
  });
});
