import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthUser, AuthVerifier } from './authVerifier.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Adds `request.user` and an `app.requireAuth` preHandler.
 * Every private route must use requireAuth — see .claude/skills/backend-feature.
 */
export function registerAuth(app: FastifyInstance, verifier: AuthVerifier): void {
  app.decorateRequest('user', null);

  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearerToken(request);
    if (!token) {
      await reply.code(401).send({ error: 'Missing bearer token' });
      return;
    }

    const user = await verifier.verifyToken(token);
    if (!user) {
      await reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }

    request.user = user;
  });
}
