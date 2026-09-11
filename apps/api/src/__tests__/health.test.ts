import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  GEMINI_API_KEY: 'test-gemini-key',
  CORS_ORIGIN: 'http://localhost:5173',
};

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('career-lens-ai-api');

    await app.close();
  });
});
