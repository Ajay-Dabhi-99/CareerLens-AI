import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ResumeAnalysis } from '@career-lens-ai/types';
import { extractResumeText } from '../../services/parser/textExtraction.js';
import { parseResumeText } from '../../services/parser/resumeParser.js';
import { scoreResume } from '../../services/ats/scoreResume.js';
import type { ResumeStorage } from '../../services/supabase/storage.js';
import type { ResumeFileRepository } from '../resume/resumeFileRepository.js';
import { PublicError } from '../../utils/errors.js';
import type { ResumeReviewRepository } from './reviewRepository.js';

export interface AiRouteDeps {
  resumeFiles: ResumeFileRepository;
  reviews: ResumeReviewRepository;
  storage: ResumeStorage;
  /** Recorded against each stored review so a quality change can be traced. */
  model: string;
}

/**
 * How many reviews one user may generate per hour.
 *
 * Deliberately low. Each one is a call against a free-tier quota shared by
 * every user of the deployment, so an enthusiastic re-analyser would otherwise
 * exhaust the day's budget for everybody. Reading an existing review is not
 * limited by this — only producing a new one.
 */
const REVIEW_RATE_LIMIT = { max: 10, timeWindow: '1 hour' };

function userKey(request: FastifyRequest): string {
  // Per user rather than per IP: a shared office address should not have one
  // person's analysis consume everyone else's allowance.
  return request.user?.id ?? request.ip;
}

/**
 * Rebuilds the resume from the stored original.
 *
 * The parsed structure is not persisted for signed-in uploads yet, so the file
 * is read back and re-parsed. That is slower than keeping the parse around, and
 * it is the honest source: the review describes the document the user actually
 * uploaded rather than JSON the browser handed us.
 */
async function loadParsedResume(
  storage: ResumeStorage,
  file: { storagePath: string; fileName: string; fileType: 'pdf' | 'docx' | 'txt' },
  userId: string,
) {
  const buffer = await storage.download(file.storagePath);

  try {
    const text = await extractResumeText(buffer, file.fileType);
    return parseResumeText(text, {
      userId,
      fileName: file.fileName,
      fileType: file.fileType,
    });
  } catch {
    throw new PublicError(
      'We could not re-read that file to review it. Try uploading it again.',
      422,
    );
  }
}

/** Quota and outage are the failures a user can act on; both read as "later". */
function toPublicAiError(error: unknown): PublicError {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new PublicError(
      'The AI review service is at capacity right now. Your score is ready — please try the review again in a few minutes.',
      429,
    );
  }

  return new PublicError(
    'The AI review could not be generated just now. Your score is unaffected — please try again shortly.',
    503,
  );
}

export function registerAiRoutes(app: FastifyInstance, deps: AiRouteDeps): void {
  const { resumeFiles, reviews, storage, model } = deps;

  /**
   * Read an existing review. Never generates one, so it costs nothing and can
   * be polled freely by the UI.
   */
  app.get<{ Params: { id: string } }>(
    '/api/resumes/:id/review',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const file = await resumeFiles.findOwned(request.params.id, user.id);
      if (!file) {
        return reply.code(404).send({ error: 'Resume file not found.' });
      }

      const review = await reviews.findForFile(file.id, user.id);

      return {
        review: review
          ? { analysis: review.analysis, model: review.model, createdAt: review.createdAt }
          : null,
      };
    },
  );

  /**
   * Generate the AI review for an uploaded resume.
   *
   * Returns the stored review unchanged when one already exists, so opening the
   * page again is free. `?refresh=true` is the only way to spend another call,
   * and it is an explicit user action.
   */
  app.post<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    '/api/resumes/:id/review',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { ...REVIEW_RATE_LIMIT, keyGenerator: userKey } },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const file = await resumeFiles.findOwned(request.params.id, user.id);
      if (!file) {
        return reply.code(404).send({ error: 'Resume file not found.' });
      }

      const refresh = request.query.refresh === 'true' || request.query.refresh === '1';

      if (!refresh) {
        const existing = await reviews.findForFile(file.id, user.id);
        if (existing) {
          return reply.send({
            review: {
              analysis: existing.analysis,
              model: existing.model,
              createdAt: existing.createdAt,
            },
            cached: true,
          });
        }
      }

      const parsed = await loadParsedResume(storage, file, user.id);
      const score = scoreResume(parsed.resume);

      let analysis: ResumeAnalysis;
      try {
        // The deterministic categories go in with the resume so the model adds
        // judgement rather than restating arithmetic it cannot do as well.
        analysis = await app.ai.analyzeResume({
          resume: parsed.resume,
          atsCategories: score.categories,
        });
      } catch (error) {
        request.log.warn({ err: error, resumeFileId: file.id }, 'AI review failed');
        throw toPublicAiError(error);
      }

      const saved = await reviews.save({
        resumeFileId: file.id,
        userId: user.id,
        analysis,
        model,
      });

      return reply.code(201).send({
        review: { analysis: saved.analysis, model: saved.model, createdAt: saved.createdAt },
        score,
        cached: false,
      });
    },
  );
}
