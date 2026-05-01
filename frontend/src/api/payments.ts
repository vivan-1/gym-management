import apiClient from './client';

export interface RecordPaymentInput {
  amount: number;
  paymentDate: string;
  paymentMethod: 'cash' | 'card' | 'online_transfer';
  membershipId: string;
  memberId: string;
}

export interface Payment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

export async function recordPayment(data: RecordPaymentInput): Promise<Payment> {
  const response = await apiClient.post<Payment>('/payments', data);
  return response.data;
}

export async function getPaymentsByMembership(membershipId: string): Promise<Payment[]> {
  const response = await apiClient.get<Payment[]>(`/payments/membership/${membershipId}`);
  return response.data;
}
