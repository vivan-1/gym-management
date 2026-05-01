import { prisma } from '../lib/prisma';
import { memberRegistrationSchema } from '../schemas/index';
import {
  MemberRegistrationInput,
  SearchQuery,
  MemberFilters,
  Pagination,
  PaginatedResult,
  MemberListItem,
} from '../types/interfaces';
import { MembershipStatus, PaymentStatus } from '../types/enums';

/**
 * Generates a unique member ID in the format GYM-XXXXX
 * where X is a random alphanumeric character (uppercase + digits).
 */
function generateMemberId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'GYM-';
  for (let i = 0; i < 5; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export class MemberServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'MemberServiceError';
    this.statusCode = statusCode;
  }
}

export class MemberService {
  /**
   * Register a new member with validated input.
   * Checks for duplicate email and generates a unique member ID.
   */
  async register(data: MemberRegistrationInput) {
    // Validate input using Zod schema
    const validation = memberRegistrationSchema.safeParse(data);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new MemberServiceError(
        `Validation failed: ${errors.map((e) => `${e.field} - ${e.message}`).join(', ')}`,
        400
      );
    }

    // Check for duplicate email
    const existingMember = await prisma.member.findUnique({
      where: { email: data.email },
    });

    if (existingMember) {
      throw new MemberServiceError(
        'A member with this email address is already registered',
        409
      );
    }

    // Generate a unique member ID (retry if collision)
    let memberId = generateMemberId();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.member.findUnique({
        where: { memberId },
      });
      if (!existing) break;
      memberId = generateMemberId();
      attempts++;
    }

    // Create the member record
    const member = await prisma.member.create({
      data: {
        memberId,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        address: data.address,
      },
    });

    return member;
  }

  /**
   * Retrieve a member by their UUID (id) or unique member ID (GYM-XXXXX format).
   * Includes current membership and payment status.
   */
  async getById(idOrMemberId: string) {
    // Try by UUID first, then by memberId
    let member = await prisma.member.findUnique({
      where: { id: idOrMemberId },
      include: {
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            payments: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!member) {
      member = await prisma.member.findUnique({
        where: { memberId: idOrMemberId },
        include: {
          memberships: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              payments: {
                orderBy: { createdAt: 'desc' },
              },
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    }

    if (!member) {
      throw new MemberServiceError('Member not found', 404);
    }

    // Map to include membership and payments in the expected format
    const currentMembership = member.memberships[0] || null;

    return {
      ...member,
      membership: currentMembership
        ? {
            id: currentMembership.id,
            startDate: currentMembership.startDate,
            endDate: currentMembership.endDate,
            durationMonths: currentMembership.durationMonths,
            status: currentMembership.status,
          }
        : undefined,
      payments: member.payments,
    };
  }

  /**
   * Search members by name, email, or member ID (case-insensitive).
   * Supports optional membership status and payment status filters, with pagination.
   */
  async search(query: SearchQuery): Promise<PaginatedResult<MemberListItem>> {
    const { term, membershipStatus, paymentStatus, pagination } = query;
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const searchTerm = term.toLowerCase();

    // Build where clause for search
    const searchCondition = {
      OR: [
        { fullName: { contains: searchTerm } },
        { email: { contains: searchTerm } },
        { memberId: { contains: searchTerm } },
      ],
    };

    // Build membership/payment filter conditions
    const membershipFilter = membershipStatus
      ? { memberships: { some: { status: membershipStatus } } }
      : {};

    const paymentFilter = paymentStatus
      ? { payments: { some: { status: paymentStatus } } }
      : {};

    const where = {
      ...searchCondition,
      ...membershipFilter,
      ...paymentFilter,
    };

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          memberships: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          payments: {
            orderBy: { createdAt: 'desc' },
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

  /**
   * List members with optional membership status and payment status filters, with pagination.
   */
  async list(
    filters: MemberFilters,
    pagination: Pagination
  ): Promise<PaginatedResult<MemberListItem>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    // Build filter conditions
    const where: Record<string, unknown> = {};

    if (filters.membershipStatus) {
      where.memberships = { some: { status: filters.membershipStatus } };
    }

    if (filters.paymentStatus) {
      where.payments = { some: { status: filters.paymentStatus } };
    }

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          memberships: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          payments: {
            orderBy: { createdAt: 'desc' },
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

export const memberService = new MemberService();
