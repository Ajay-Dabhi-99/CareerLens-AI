import { getAccessToken } from '@/lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface MeResponse {
  user: { id: string; email: string | null } | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new ApiError(`Health check failed`, response.status);
  }
  return response.json() as Promise<HealthResponse>;
}

/**
 * Calls a private API route with the current Supabase access token attached.
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError('Not authenticated', 401);
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed`, response.status);
  }
  return response;
}

export async function getMe(): Promise<MeResponse> {
  const response = await authedFetch('/api/me');
  return response.json() as Promise<MeResponse>;
}
