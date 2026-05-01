import { prisma } from '../lib/prisma';
import { paymentRecordSchema } from '../schemas/index';
import { PaymentRecordInput, OverdueEvaluationResult, PaymentSummary } from '../types/interfaces';
import { PaymentStatus } from '../types/enums';

export class PaymentServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'PaymentServiceError';
    this.statusCode = statusCode;
  }
}

export class PaymentService {
  private getCurrentDate: () => Date;

  constructor(getCurrentDate?: () => Date) {
    this.getCurrentDate = getCurrentDate || (() => new Date());
  }

  /**
   * Record a payment for a member.
   * Validates input, creates Payment record with Paid status, associates with membership.
   */
  async record(memberId: string, data: PaymentRecordInput) {
    // Validate input using Zod schema
    const validation = paymentRecordSchema.safeParse(data);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new PaymentServiceError(
        `Validation failed: ${errors.map((e) => `${e.field} - ${e.message}`).join(', ')}`,
        400
      );
    }

    // Verify membership exists
    const membership = await prisma.membership.findUnique({
      where: { id: data.membershipId },
    });

    if (!membership) {
      throw new PaymentServiceError('Membership not found', 404);
    }

    // Verify member exists
    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new PaymentServiceError('Member not found', 404);
    }

    // Create payment with Paid status
    const payment = await prisma.payment.create({
      data: {
        memberId,
        membershipId: data.membershipId,
        amount: data.amount,
        paymentDate: new Date(data.paymentDate),
        paymentMethod: data.paymentMethod,
        status: PaymentStatus.Paid,
      },
    });

    return payment;
  }

  /**
   * Batch-evaluate all Pending payments.
   * Sets to Overdue when membership start date + 7 days < current date.
   */
  async evaluateOverdue(): Promise<OverdueEvaluationResult> {
    // Get all pending payments with their membership info
    const pendingPayments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.Pending,
      },
      include: {
        membership: true,
        member: true,
      },
    });

    const now = this.getCurrentDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const newlyOverdue: string[] = [];

    for (const payment of pendingPayments) {
      const membershipStartDate = new Date(payment.membership.startDate);
      const startDateNormalized = new Date(
        membershipStartDate.getFullYear(),
        membershipStartDate.getMonth(),
        membershipStartDate.getDate()
      );

      // Calculate days since membership start
      const daysSinceStart = Math.floor(
        (today.getTime() - startDateNormalized.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Set to Overdue when membership start date + 7 days < current date
      // i.e., more than 7 days have passed since start
      if (daysSinceStart > 7) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.Overdue },
        });
        newlyOverdue.push(payment.member.memberId);
      }
    }

    return {
      newlyOverdue,
      totalEvaluated: pendingPayments.length,
    };
  }

  /**
   * Get all payments for a membership.
   */
  async getByMembershipId(membershipId: string) {
    const payments = await prisma.payment.findMany({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
    });

    return payments;
  }

  /**
   * Get payment summary: total collected, pending count, and overdue count.
   */
  async getPaymentSummary(): Promise<PaymentSummary> {
    const [paidPayments, pendingCount, overdueCount] = await Promise.all([
      prisma.payment.aggregate({
        where: { status: PaymentStatus.Paid },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { status: PaymentStatus.Pending },
      }),
      prisma.payment.count({
        where: { status: PaymentStatus.Overdue },
      }),
    ]);

    return {
      totalCollected: paidPayments._sum.amount || 0,
      pendingCount,
      overdueCount,
    };
  }
}

export const paymentService = new PaymentService();
