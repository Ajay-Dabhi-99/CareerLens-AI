import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { AuthVerifier } from '../modules/auth/index.js';

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  GEMINI_API_KEY: 'test-gemini-key',
  CORS_ORIGIN: 'http://localhost:5173',
};

function verifierReturning(user: { id: string; email: string | null } | null): AuthVerifier {
  return { verifyToken: vi.fn().mockResolvedValue(user) };
}

describe('GET /api/me', () => {
  it('returns the authenticated user for a valid token', async () => {
    const app = await buildApp(testEnv, {
      authVerifier: verifierReturning({ id: 'user-1', email: 'jane@example.com' }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: 'user-1', email: 'jane@example.com' } });

    await app.close();
  });

  it('rejects a request with no Authorization header', async () => {
    const app = await buildApp(testEnv, { authVerifier: verifierReturning(null) });

    const response = await app.inject({ method: 'GET', url: '/api/me' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a malformed Authorization header', async () => {
    const app = await buildApp(testEnv, {
      authVerifier: verifierReturning({ id: 'user-1', email: null }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'not-a-bearer-token' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a token the verifier rejects', async () => {
    const verifier = verifierReturning(null);
    const app = await buildApp(testEnv, { authVerifier: verifier });

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'Bearer expired-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(verifier.verifyToken).toHaveBeenCalledWith('expired-token');

    await app.close();
  });
});
