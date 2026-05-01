import { prisma } from '../lib/prisma';
import { membershipService } from './membership.service';
import { paymentService } from './payment.service';
import { notificationService } from './notification.service';
import {
  DashboardSummary,
  Pagination,
  PaginatedResult,
  MemberListItem,
} from '../types/interfaces';
import { MembershipStatus, PaymentStatus } from '../types/enums';

export class DashboardServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'DashboardServiceError';
    this.statusCode = statusCode;
  }
}

export class DashboardService {
  /**
   * Aggregate total members, membership status counts, payment summary,
   * and recent notifications for the admin dashboard.
   */
  async getSummary(adminId: string): Promise<DashboardSummary> {
    const [totalMembers, membershipCounts, paymentSummary, recentNotifications] =
      await Promise.all([
        prisma.member.count(),
        membershipService.getStatusCounts(),
        paymentService.getPaymentSummary(),
        notificationService.getInAppNotifications(adminId, { page: 1, pageSize: 10 }),
      ]);

    return {
      totalMembers,
      membershipCounts,
      paymentSummary,
      recentNotifications: recentNotifications.data,
    };
  }

  /**
   * Return paginated members filtered by membership status.
   */
  async getMembersByStatus(
    status: MembershipStatus,
    pagination: Pagination
  ): Promise<PaginatedResult<MemberListItem>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    // Validate status
    const validStatuses = Object.values(MembershipStatus);
    if (!validStatuses.includes(status)) {
      throw new DashboardServiceError(
        `Invalid membership status. Must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }

    const where = {
      memberships: {
        some: { status },
      },
    };

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          memberships: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
          },
          payments: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
          },
        },
      }),
      prisma.member.count({ where }),
    ]);

    const data: MemberListItem[] = members.map((member) => ({
      id: member.id,
      memberId: member.memberId,
      fullName: member.fullName,
      email: member.email,
      membershipStatus: member.memberships[0]
        ? (member.memberships[0].status as MembershipStatus)
        : null,
      paymentStatus: member.payments[0]
        ? (member.payments[0].status as PaymentStatus)
        : null,
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}

export const dashboardService = new DashboardService();
