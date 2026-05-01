import apiClient from './client';

export interface MemberRegistrationInput {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  address: string;
}

export interface MemberListItem {
  id: string;
  memberId: string;
  fullName: string;
  email: string;
  membershipStatus: string | null;
  paymentStatus: string | null;
}

export interface PaginatedMembers {
  data: MemberListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MemberDetail {
  id: string;
  memberId: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  createdAt: string;
  membership?: {
    id: string;
    startDate: string;
    endDate: string;
    durationMonths: number;
    status: string;
  };
  payments?: Payment[];
}

export interface Payment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

export interface MemberFilters {
  membershipStatus?: string;
  paymentStatus?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function registerMember(data: MemberRegistrationInput): Promise<MemberDetail> {
  const response = await apiClient.post<MemberDetail>('/members', data);
  return response.data;
}

export async function getMembers(filters: MemberFilters = {}): Promise<PaginatedMembers> {
  const response = await apiClient.get<PaginatedMembers>('/members', { params: filters });
  return response.data;
}

export async function getMemberById(id: string): Promise<MemberDetail> {
  const response = await apiClient.get<MemberDetail>(`/members/${id}`);
  return response.data;
}

export async function searchMembers(query: string, filters: MemberFilters = {}): Promise<PaginatedMembers> {
  const response = await apiClient.get<PaginatedMembers>('/members/search', {
    params: { term: query, ...filters },
  });
  return response.data;
}
