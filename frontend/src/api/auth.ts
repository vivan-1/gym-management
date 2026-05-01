import apiClient from './client';

export interface LoginResponse {
  token: string;
  admin: {
    id: string;
    email: string;
  };
}

export interface AuthErrorResponse {
  message: string;
}

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  return response.data;
}
