import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JobRequirement, Resume, SkillMatch } from '@career-lens-ai/types';
import { deterministicMatch, matchScore } from '../../services/matcher/deterministicMatch.js';
import { PublicError } from '../../utils/errors.js';
import type { ResumeEditorRepository } from '../editor/resumeRepository.js';
import type { JobMatchRepository } from './matchRepository.js';
import type { JobRepository } from './jobRepository.js';

export interface MatchRouteDeps {
  jobs: JobRepository;
  matches: JobMatchRepository;
  resumes: ResumeEditorRepository;
  model: string;
}

/** Matching costs at most one AI call, and only for what a lookup could not settle. */
const MATCH_RATE_LIMIT = { max: 20, timeWindow: '1 hour' };

const matchBodySchema = z.object({
  resumeId: z.string().min(1),
});

function userKey(request: FastifyRequest): string {
  return request.user?.id ?? request.ip;
}

export function registerMatchRoutes(app: FastifyInstance, deps: MatchRouteDeps): void {
  const { jobs, matches, resumes, model } = deps;

  /**
   * Matches a resume against a posting.
   *
   * Two passes, in the order the spec's hybrid table sets out. A keyword lookup
   * settles what can be settled by looking — cheaply, identically every time,
   * and with a quotable line. Only what is left goes to the model, which can
   * recognise a requirement described in different words.
   *
   * The score is computed from the verdicts here, never by the model. That
   * keeps the number explainable and means nothing in a posting or a resume can
   * talk it upwards.
   */
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/match',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { ...MATCH_RATE_LIMIT, keyGenerator: userKey } },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const body = matchBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'A resumeId is required.' });
      }

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
      if (!draft) throw new PublicError('This resume has no working draft to match.', 409);

      const existing = await matches.findForPair(draft.id, analysis.id, user.id);
      if (existing) {
        return reply.send({ match: existing, cached: true });
      }

      const requirements = analysis.requirements as JobRequirement[];
      const { matches: settled, unresolved } = deterministicMatch(
        requirements,
        draft.data as Resume,
      );

      let verdicts: SkillMatch[] = [];
      if (unresolved.length > 0) {
        try {
          const judged = await app.ai.matchRequirements({
            resume: draft.data as Resume,
            requirements: unresolved,
          });

          verdicts = judged.map((verdict) => ({
            id: verdict.requirementId,
            requirementId: verdict.requirementId,
            state: verdict.state,
            evidence: verdict.evidence,
            confidence: verdict.confidence,
          }));
        } catch (error) {
          request.log.warn({ err: error, jobId: job.id }, 'AI matching failed');

          /*
           * The deterministic half still stands, so the user gets a partial
           * answer rather than nothing. Unjudged requirements are reported as
           * needing verification, not as missing: we did not look, and saying
           * "missing" would be a claim we have not earned.
           */
          verdicts = unresolved.map((requirement) => ({
            id: requirement.id,
            requirementId: requirement.id,
            state: 'needsVerification' as const,
            confidence: 0,
          }));
        }
      }

      const all = [...settled, ...verdicts];
      const saved = await matches.save({
        userId: user.id,
        resumeVersionId: draft.id,
        jobAnalysisId: analysis.id,
        matchScore: matchScore(requirements, all),
        matches: all,
        model,
      });

      return reply.code(201).send({
        match: saved,
        cached: false,
        // Named so the UI can say which verdicts were read and which were
        // judged, rather than presenting both with the same authority.
        settledByKeyword: settled.length,
        judgedByAi: verdicts.length,
      });
    },
  );

  /** Reads an existing match. Never generates one, so it costs nothing. */
  app.get<{ Params: { id: string }; Querystring: { resumeId?: string } }>(
    '/api/jobs/:id/match',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      if (!request.query.resumeId) {
        return reply.code(400).send({ error: 'A resumeId is required.' });
      }

      const job = await jobs.findOwned(request.params.id, user.id);
      if (!job) return reply.code(404).send({ error: 'Job description not found.' });

      const analysis = await jobs.findAnalysis(job.id, user.id);
      if (!analysis) return { match: null };

      const resume = await resumes.findOwned(request.query.resumeId, user.id);
      if (!resume) return reply.code(404).send({ error: 'Resume not found.' });

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((version) => version.label === 'draft');
      if (!draft) return { match: null };

      return { match: await matches.findForPair(draft.id, analysis.id, user.id) };
    },
  );
}
