import { prisma } from '../lib/prisma';
import { NotificationType } from '../types/enums';
import { InAppNotificationInput, InAppNotification, Pagination, PaginatedResult } from '../types/interfaces';

export class NotificationServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'NotificationServiceError';
    this.statusCode = statusCode;
  }
}

const EXPIRY_WINDOW_KEY = 'expiry_window_days';
const DEFAULT_EXPIRY_WINDOW = 7;

export class NotificationService {
  /**
   * Create an in-app notification record with type, title, message, and optional related member ID.
   */
  async createInAppNotification(adminId: string, notification: InAppNotificationInput): Promise<InAppNotification> {
    const record = await prisma.notification.create({
      data: {
        adminId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedMemberId: notification.relatedMemberId || null,
      },
    });

    return {
      id: record.id,
      adminId: record.adminId,
      type: record.type as NotificationType,
      title: record.title,
      message: record.message,
      relatedMemberId: record.relatedMemberId || undefined,
      isRead: record.isRead,
      createdAt: record.createdAt,
    };
  }

  /**
   * Return paginated notifications sorted by creation date descending (most recent first).
   */
  async getInAppNotifications(adminId: string, pagination: Pagination): Promise<PaginatedResult<InAppNotification>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { adminId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.notification.count({
        where: { adminId },
      }),
    ]);

    const data: InAppNotification[] = notifications.map((n) => ({
      id: n.id,
      adminId: n.adminId,
      type: n.type as NotificationType,
      title: n.title,
      message: n.message,
      relatedMemberId: n.relatedMemberId || undefined,
      isRead: n.isRead,
      createdAt: n.createdAt,
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
   * Update SystemConfig for expiry window.
   */
  async configureExpiryWindow(days: number): Promise<void> {
    if (!Number.isInteger(days) || days < 1) {
      throw new NotificationServiceError('Expiry window must be a positive integer', 400);
    }

    await prisma.systemConfig.upsert({
      where: { key: EXPIRY_WINDOW_KEY },
      update: { value: String(days) },
      create: { key: EXPIRY_WINDOW_KEY, value: String(days) },
    });
  }

  /**
   * Read current expiry window from SystemConfig (default 7 days).
   */
  async getExpiryWindow(): Promise<number> {
    const config = await prisma.systemConfig.findUnique({
      where: { key: EXPIRY_WINDOW_KEY },
    });

    if (!config) {
      return DEFAULT_EXPIRY_WINDOW;
    }

    const value = parseInt(config.value, 10);
    return isNaN(value) ? DEFAULT_EXPIRY_WINDOW : value;
  }
}

export const notificationService = new NotificationService();
