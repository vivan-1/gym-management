import apiClient from './client';

export interface InAppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedMemberId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedNotifications {
  data: InAppNotification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getNotifications(page = 1, limit = 10): Promise<PaginatedNotifications> {
  const response = await apiClient.get<PaginatedNotifications>('/notifications', {
    params: { page, limit },
  });
  return response.data;
}

export async function getExpiryWindow(): Promise<number> {
  const response = await apiClient.get<{ days: number }>('/notifications/expiry-window');
  return response.data.days;
}

export async function updateExpiryWindow(days: number): Promise<void> {
  await apiClient.put('/notifications/expiry-window', { days });
}
