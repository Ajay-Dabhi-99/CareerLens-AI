import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import type { ServerEnv } from '@career-lens-ai/config';
import {
  createSupabaseAuthVerifier,
  registerAuth,
  registerAuthRoutes,
  type AuthVerifier,
} from './modules/auth/index.js';
import { createSupabaseAdminClient } from './services/supabase/client.js';

export interface BuildAppOptions {
  /** Override the auth verifier in tests so no live Supabase project is needed. */
  authVerifier?: AuthVerifier;
}

export async function buildApp(
  env: ServerEnv,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(sensible);

  const authVerifier =
    options.authVerifier ?? createSupabaseAuthVerifier(createSupabaseAdminClient(env));
  registerAuth(app, authVerifier);

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'career-lens-ai-api',
    timestamp: new Date().toISOString(),
  }));

  registerAuthRoutes(app);

  return app;
}
