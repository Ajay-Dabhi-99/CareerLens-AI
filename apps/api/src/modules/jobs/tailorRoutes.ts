import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { resumeDraftSchema } from '@career-lens-ai/validation';
import type { JobRequirement, Resume, ResumeSuggestion } from '@career-lens-ai/types';
import { scoreResume } from '../../services/ats/scoreResume.js';
import { PublicError } from '../../utils/errors.js';
import type { ResumeEditorRepository } from '../editor/resumeRepository.js';
import type { JobMatchRepository } from './matchRepository.js';
import type { JobRepository } from './jobRepository.js';

export interface TailorRouteDeps {
  jobs: JobRepository;
  matches: JobMatchRepository;
  resumes: ResumeEditorRepository;
}

const TAILOR_RATE_LIMIT = { max: 10, timeWindow: '1 hour' };

const suggestBodySchema = z.object({
  resumeId: z.string().min(1),
});

const createBodySchema = z.object({
  resumeId: z.string().min(1),
  name: z.string().min(1).max(120),
  data: resumeDraftSchema,
});

function userKey(request: FastifyRequest): string {
  return request.user?.id ?? request.ip;
}

function toPublicAiError(error: unknown): PublicError {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new PublicError(
      'The AI is at capacity right now. Nothing has changed — try tailoring again in a few minutes.',
      429,
    );
  }

  return new PublicError(
    'Those suggestions could not be generated just now. Nothing has changed — please try again shortly.',
    503,
  );
}

export function registerTailorRoutes(app: FastifyInstance, deps: TailorRouteDeps): void {
  const { jobs, matches, resumes } = deps;

  /**
   * Suggests how the resume could be tailored to one posting.
   *
   * Suggestions only. Like the rewrite route, this one has no path to a write,
   * so "tailor without damaging the master resume" is a property of the design
   * rather than a promise: creating the tailored version is a separate,
   * explicit request with the user's approved text in it.
   */
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/tailor',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { ...TAILOR_RATE_LIMIT, keyGenerator: userKey } },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const body = suggestBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'A resumeId is required.' });

      const job = await jobs.findOwned(request.params.id, user.id);
      if (!job) return reply.code(404).send({ error: 'Job description not found.' });

      const analysis = await jobs.findAnalysis(job.id, user.id);
      if (!analysis) {
        return reply.code(409).send({
          error: 'Extract the requirements from this job description first.',
        });
      }

      const resume = await resumes.findOwned(body.data.resumeId, user.id);
      if (!resume) return reply.code(404).send({ error: 'Resume not found.' });

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((version) => version.label === 'draft');
      if (!draft) throw new PublicError('This resume has no working draft to tailor.', 409);

      const match = await matches.findForPair(draft.id, analysis.id, user.id);
      if (!match) {
        // Tailoring without knowing what already matches would mean suggesting
        // changes to things that are already fine, and guessing at the rest.
        return reply.code(409).send({
          error: 'Compare this resume against the job description first.',
        });
      }

      const requirements = analysis.requirements as JobRequirement[];
      const byId = new Map(match.matches.map((entry) => [entry.requirementId, entry]));

      /*
       * Only what is not already clearly shown. A requirement the resume
       * already demonstrates needs no tailoring, and including it would spend
       * the model's attention on work that is done.
       */
      const gaps = requirements
        .map((requirement) => ({
          requirement: requirement.text,
          state: byId.get(requirement.id)?.state ?? ('missing' as const),
          evidence: byId.get(requirement.id)?.evidence,
        }))
        .filter((gap) => gap.state !== 'matched');

      if (gaps.length === 0) {
        return reply.send({
          suggestions: [],
          message: 'Your resume already shows everything this posting asks for.',
        });
      }

      let suggestions: ResumeSuggestion[];
      try {
        suggestions = await app.ai.suggestTailoring({
          resume: draft.data as Resume,
          role: [job.title, job.company].filter(Boolean).join(' at ') || 'this role',
          gaps,
        });
      } catch (error) {
        request.log.warn({ err: error, jobId: job.id }, 'Tailoring suggestions failed');
        throw toPublicAiError(error);
      }

      return reply.send({ suggestions, gaps: gaps.length });
    },
  );

  /**
   * Creates the tailored version from text the user approved.
   *
   * A new version, alongside the draft and the original, never replacing
   * either. The body is validated as a draft resume, so nothing the browser
   * sends can store a shape the editor could not open again.
   */
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/tailored',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const body = createBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'A name and the tailored resume are required.' });
      }

      const job = await jobs.findOwned(request.params.id, user.id);
      if (!job) return reply.code(404).send({ error: 'Job description not found.' });

      const resume = await resumes.findOwned(body.data.resumeId, user.id);
      if (!resume) return reply.code(404).send({ error: 'Resume not found.' });

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((version) => version.label === 'draft');

      const created = await resumes.createTailored({
        resumeId: resume.id,
        userId: user.id,
        name: body.data.name,
        data: body.data.data as Resume,
        parentVersionId: draft?.id,
      });

      return reply.code(201).send({
        version: created,
        score: scoreResume(created.data as Resume),
      });
    },
  );
}
