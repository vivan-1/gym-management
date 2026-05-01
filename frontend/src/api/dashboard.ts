import apiClient from './client';

export interface MembershipStatusCounts {
  active: number;
  expiringSoon: number;
  expired: number;
}

export interface PaymentSummary {
  totalCollected: number;
  pendingCount: number;
  overdueCount: number;
}

export interface InAppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedMemberId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardSummary {
  totalMembers: number;
  membershipCounts: MembershipStatusCounts;
  paymentSummary: PaymentSummary;
  recentNotifications: InAppNotification[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await apiClient.get<DashboardSummary>('/dashboard/summary');
  return response.data;
}

export async function getMembersByStatus(status: string, page = 1, limit = 10) {
  const response = await apiClient.get(`/dashboard/members/${status}`, {
    params: { page, limit },
  });
  return response.data;
}
