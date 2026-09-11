import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import type { ServerEnv } from '@career-lens-ai/config';

export async function buildApp(env: ServerEnv): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(sensible);

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'career-lens-ai-api',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
