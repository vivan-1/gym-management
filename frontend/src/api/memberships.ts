import apiClient from './client';

export interface RenewMembershipInput {
  duration: 1 | 3 | 6 | 12;
}

export interface CreateMembershipInput {
  memberId: string;
  startDate: string;
  duration: 1 | 3 | 6 | 12;
}

export interface Membership {
  id: string;
  memberId: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  status: string;
}

export async function createMembership(data: CreateMembershipInput): Promise<Membership> {
  const response = await apiClient.post<Membership>('/memberships', data);
  return response.data;
}

export async function renewMembership(membershipId: string, data: RenewMembershipInput): Promise<Membership> {
  const response = await apiClient.put<Membership>(`/memberships/${membershipId}/renew`, data);
  return response.data;
}

export interface UpdateMembershipInput {
  startDate?: string;
  endDate?: string;
  status?: string;
}

export async function updateMembership(membershipId: string, data: UpdateMembershipInput): Promise<Membership> {
  const response = await apiClient.put<Membership>(`/memberships/${membershipId}`, data);
  return response.data;
}

export async function getMembershipByMemberId(memberId: string): Promise<Membership | null> {
  const response = await apiClient.get<Membership>(`/memberships/member/${memberId}`);
  return response.data;
}
