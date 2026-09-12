import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Resume, RewriteOption } from '@career-lens-ai/types';
import { PublicError } from '../../utils/errors.js';
import type { ResumeEditorRepository } from './resumeRepository.js';

export interface RewriteRouteDeps {
  resumes: ResumeEditorRepository;
}

/**
 * Rewrites are the most-clicked AI action in the product and each one is a call
 * against a free tier measured in tens per day, so the allowance is per user
 * and deliberately modest.
 */
const REWRITE_RATE_LIMIT = { max: 20, timeWindow: '1 hour' };

const rewriteBodySchema = z.object({
  target: z.enum(['summary', 'bullet', 'project', 'skills']),
  currentText: z.string().min(1).max(5_000),
});

/**
 * Remembers the options already produced for a given piece of text.
 *
 * Asking twice about text that has not changed should not cost twice. This is
 * in memory rather than a table because it is an optimisation, not a record:
 * losing it on restart costs one call, and it needs no migration to exist.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  options: RewriteOption[];
  expiresAt: number;
}

const rewriteCache = new Map<string, CacheEntry>();

function cacheKey(userId: string, target: string, text: string): string {
  // The text is hashed rather than stored: resume content should not sit in a
  // process-wide map in readable form.
  const digest = createHash('sha256').update(text).digest('hex');
  return `${userId}:${target}:${digest}`;
}

function readCache(key: string): RewriteOption[] | null {
  const entry = rewriteCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    rewriteCache.delete(key);
    return null;
  }

  return entry.options;
}

function writeCache(key: string, options: RewriteOption[]): void {
  // Oldest-first eviction. Map preserves insertion order, so the first key is
  // the least recently added.
  if (rewriteCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = rewriteCache.keys().next().value;
    if (oldest) rewriteCache.delete(oldest);
  }

  rewriteCache.set(key, { options, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exposed for tests; never called by the routes themselves. */
export function clearRewriteCache(): void {
  rewriteCache.clear();
}

function userKey(request: FastifyRequest): string {
  return request.user?.id ?? request.ip;
}

function toPublicAiError(error: unknown): PublicError {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new PublicError(
      'The AI is at capacity right now. Your resume is unaffected — try this rewrite again in a few minutes.',
      429,
    );
  }

  return new PublicError(
    'That rewrite could not be generated just now. Your resume is unaffected — please try again shortly.',
    503,
  );
}

export function registerRewriteRoutes(app: FastifyInstance, deps: RewriteRouteDeps): void {
  const { resumes } = deps;

  /**
   * Produces rewrite options for a piece of the resume.
   *
   * This route deliberately cannot change the resume. It reads the draft for
   * context and returns suggestions; applying one is a separate, explicit save
   * the user triggers. "Never overwrite the user's content automatically" is
   * therefore a property of the design rather than a promise in a comment.
   */
  app.post<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/rewrite',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { ...REWRITE_RATE_LIMIT, keyGenerator: userKey } },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const body = rewriteBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'A target and some text to rewrite are required.' });
      }

      const resume = await resumes.findOwned(request.params.id, user.id);
      if (!resume) {
        return reply.code(404).send({ error: 'Resume not found.' });
      }

      const key = cacheKey(user.id, body.data.target, body.data.currentText);
      const cached = readCache(key);
      if (cached) {
        return { options: cached, cached: true };
      }

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((version) => version.label === 'draft');
      if (!draft) {
        throw new PublicError('This resume has no working draft to rewrite from.', 409);
      }

      let options: RewriteOption[];
      try {
        /*
         * The whole draft goes in as context so the model can ground a rewrite
         * in the rest of the resume rather than inventing detail to fill it.
         * The prompt forbids adding facts; the context is what makes that
         * instruction followable.
         */
        const result = await app.ai.rewriteSection({
          target: body.data.target,
          currentText: body.data.currentText,
          context: draft.data as Partial<Resume>,
        });
        options = result.options;
      } catch (error) {
        request.log.warn(
          { err: error, resumeId: resume.id, target: body.data.target },
          'AI rewrite failed',
        );
        throw toPublicAiError(error);
      }

      writeCache(key, options);

      return { options, cached: false };
    },
  );
}
