import { MembershipStatus, PaymentStatus, PaymentMethod, Gender, NotificationType } from './enums';

export interface MemberRegistrationInput {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  gender: Gender;
  address: string;
}

export interface MembershipCreateInput {
  startDate: Date;
  duration: MembershipDuration;
}

export type MembershipDuration = 1 | 3 | 6 | 12;

export interface PaymentRecordInput {
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  membershipId: string;
}

export interface SearchQuery {
  term: string;
  membershipStatus?: MembershipStatus;
  paymentStatus?: PaymentStatus;
  pagination: Pagination;
}

export interface MemberFilters {
  membershipStatus?: MembershipStatus;
  paymentStatus?: PaymentStatus;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MemberListItem {
  id: string;
  memberId: string;
  fullName: string;
  email: string;
  membershipStatus: MembershipStatus | null;
  paymentStatus: PaymentStatus | null;
}

export interface InAppNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  relatedMemberId?: string;
}

export interface StatusEvaluationResult {
  newlyExpiringSoon: string[];
  newlyExpired: string[];
  totalEvaluated: number;
}

export interface OverdueEvaluationResult {
  newlyOverdue: string[];
  totalEvaluated: number;
}

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

export interface DashboardSummary {
  totalMembers: number;
  membershipCounts: MembershipStatusCounts;
  paymentSummary: PaymentSummary;
  recentNotifications: InAppNotification[];
}

export interface InAppNotification {
  id: string;
  adminId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedMemberId?: string;
  isRead: boolean;
  createdAt: Date;
}

export interface AdminProfile {
  id: string;
  email: string;
}

export interface DailyEvaluationResult {
  membershipEvaluation: StatusEvaluationResult;
  overdueEvaluation: OverdueEvaluationResult;
  notificationsSent: number;
  errors: string[];
}
