import { prisma } from '../lib/prisma';
import { membershipCreateSchema } from '../schemas/index';
import {
  MembershipCreateInput,
  MembershipDuration,
  StatusEvaluationResult,
  MembershipStatusCounts,
} from '../types/interfaces';
import { MembershipStatus } from '../types/enums';

const DEFAULT_EXPIRY_WINDOW_DAYS = 7;

export class MembershipServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'MembershipServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Adds exactly N months to a given date.
 * Handles month-end edge cases (e.g., Jan 31 + 1 month = Feb 28/29).
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  // If the day overflowed (e.g., Jan 31 -> Mar 3), set to last day of target month
  if (result.getDate() !== day) {
    result.setDate(0); // sets to last day of previous month
  }
  return result;
}

export class MembershipService {
  private getCurrentDate: () => Date;

  constructor(getCurrentDate?: () => Date) {
    this.getCurrentDate = getCurrentDate || (() => new Date());
  }

  /**
   * Create a new membership for a member.
   * Validates start date and duration, calculates end date,
   * and sets status to Active if current date is within range.
   */
  async create(memberId: string, data: MembershipCreateInput) {
    // Validate input using Zod schema
    const validation = membershipCreateSchema.safeParse(data);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new MembershipServiceError(
        `Validation failed: ${errors.map((e) => `${e.field} - ${e.message}`).join(', ')}`,
        400
      );
    }

    // Verify member exists
    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new MembershipServiceError('Member not found', 404);
    }

    // Calculate end date
    const startDate = new Date(data.startDate);
    const endDate = addMonths(startDate, data.duration);

    // Determine status based on current date
    const now = this.getCurrentDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    let status = MembershipStatus.Active;
    if (today > end) {
      status = MembershipStatus.Expired;
    } else if (today < start) {
      // Future membership - still set to Active per requirements
      status = MembershipStatus.Active;
    }

    const membership = await prisma.membership.create({
      data: {
        memberId,
        startDate,
        endDate,
        durationMonths: data.duration,
        status,
      },
    });

    return membership;
  }

  /**
   * Renew a membership.
   * If active: extend from current end date.
   * If expired: extend from current date.
   * Resets status to Active.
   */
  async renew(membershipId: string, duration: MembershipDuration) {
    // Validate duration
    const validDurations: MembershipDuration[] = [1, 3, 6, 12];
    if (!validDurations.includes(duration)) {
      throw new MembershipServiceError(
        'Duration must be 1, 3, 6, or 12 months',
        400
      );
    }

    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new MembershipServiceError('Membership not found', 404);
    }

    // Determine base date for extension
    const now = this.getCurrentDate();
    let baseDate: Date;

    if (membership.status === MembershipStatus.Expired) {
      // Expired: extend from current date
      baseDate = now;
    } else {
      // Active or Expiring Soon: extend from current end date
      baseDate = new Date(membership.endDate);
    }

    const newEndDate = addMonths(baseDate, duration);

    const updatedMembership = await prisma.membership.update({
      where: { id: membershipId },
      data: {
        endDate: newEndDate,
        durationMonths: duration,
        status: MembershipStatus.Active,
      },
    });

    return updatedMembership;
  }

  /**
   * Batch-evaluate all memberships.
   * Sets Expiring_Soon when remaining days <= expiry window.
   * Sets Expired when past end date.
   * Returns which members are newly expiring_soon and newly expired (for notifications).
   */
  async evaluateStatuses(): Promise<StatusEvaluationResult> {
    // Get expiry window from SystemConfig
    const expiryWindowConfig = await prisma.systemConfig.findUnique({
      where: { key: 'expiry_window_days' },
    });
    const expiryWindowDays = expiryWindowConfig
      ? parseInt(expiryWindowConfig.value, 10)
      : DEFAULT_EXPIRY_WINDOW_DAYS;

    // Get all non-expired memberships (active and expiring_soon)
    const memberships = await prisma.membership.findMany({
      where: {
        status: {
          in: [MembershipStatus.Active, MembershipStatus.ExpiringSoon],
        },
      },
      include: {
        member: true,
      },
    });

    const now = this.getCurrentDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const newlyExpiringSoon: string[] = [];
    const newlyExpired: string[] = [];

    for (const membership of memberships) {
      const endDate = new Date(membership.endDate);
      const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

      // Calculate remaining days
      const remainingMs = end.getTime() - today.getTime();
      const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

      if (remainingDays <= 0) {
        // Expired
        if (membership.status !== MembershipStatus.Expired) {
          await prisma.membership.update({
            where: { id: membership.id },
            data: { status: MembershipStatus.Expired },
          });
          newlyExpired.push(membership.member.memberId);
        }
      } else if (remainingDays <= expiryWindowDays) {
        // Expiring Soon
        if (membership.status !== MembershipStatus.ExpiringSoon) {
          await prisma.membership.update({
            where: { id: membership.id },
            data: { status: MembershipStatus.ExpiringSoon },
          });
          newlyExpiringSoon.push(membership.member.memberId);
        }
      }
      // Otherwise remains Active - no change needed
    }

    return {
      newlyExpiringSoon,
      newlyExpired,
      totalEvaluated: memberships.length,
    };
  }

  /**
   * Get the current (most recent) membership for a member.
   */
  async getByMemberId(memberId: string) {
    const membership = await prisma.membership.findFirst({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return membership;
  }

  /**
   * Update a membership's start date, end date, and/or status.
   * If dates are changed but status is not explicitly provided,
   * the status is auto-evaluated based on the new dates.
   */
  async update(membershipId: string, data: { startDate?: Date; endDate?: Date; status?: MembershipStatus }) {
    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new MembershipServiceError('Membership not found', 404);
    }

    const updateData: Record<string, unknown> = {};

    if (data.startDate) {
      updateData.startDate = new Date(data.startDate);
    }

    if (data.endDate) {
      updateData.endDate = new Date(data.endDate);
    }

    if (data.status) {
      const validStatuses = Object.values(MembershipStatus);
      if (!validStatuses.includes(data.status)) {
        throw new MembershipServiceError(
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          400
        );
      }
      updateData.status = data.status;
    }

    if (Object.keys(updateData).length === 0) {
      throw new MembershipServiceError('No fields to update', 400);
    }

    // Auto-evaluate status if dates changed but status wasn't explicitly set
    if ((data.startDate || data.endDate) && !data.status) {
      const effectiveEndDate = new Date((updateData.endDate as Date) || membership.endDate);
      const effectiveStartDate = new Date((updateData.startDate as Date) || membership.startDate);
      const now = this.getCurrentDate();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(effectiveEndDate.getFullYear(), effectiveEndDate.getMonth(), effectiveEndDate.getDate());

      // Get expiry window
      const expiryWindowConfig = await prisma.systemConfig.findUnique({
        where: { key: 'expiry_window_days' },
      });
      const expiryWindowDays = expiryWindowConfig
        ? parseInt(expiryWindowConfig.value, 10)
        : DEFAULT_EXPIRY_WINDOW_DAYS;

      const remainingMs = end.getTime() - today.getTime();
      const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

      if (remainingDays <= 0) {
        updateData.status = MembershipStatus.Expired;
      } else if (remainingDays <= expiryWindowDays) {
        updateData.status = MembershipStatus.ExpiringSoon;
      } else {
        updateData.status = MembershipStatus.Active;
      }
    }

    const updatedMembership = await prisma.membership.update({
      where: { id: membershipId },
      data: updateData,
    });

    return updatedMembership;
  }

  /**
   * Get counts of Active, Expiring_Soon, and Expired memberships.
   */
  async getStatusCounts(): Promise<MembershipStatusCounts> {
    const [active, expiringSoon, expired] = await Promise.all([
      prisma.membership.count({
        where: { status: MembershipStatus.Active },
      }),
      prisma.membership.count({
        where: { status: MembershipStatus.ExpiringSoon },
      }),
      prisma.membership.count({
        where: { status: MembershipStatus.Expired },
      }),
    ]);

    return {
      active,
      expiringSoon,
      expired,
    };
  }
}

export const membershipService = new MembershipService();
