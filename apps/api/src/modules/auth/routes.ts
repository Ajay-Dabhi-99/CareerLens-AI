import type { FastifyInstance } from 'fastify';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/api/me', { preHandler: app.requireAuth }, async (request) => ({
    user: request.user,
  }));
}
