import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Resume, ResumeVersion } from '@career-lens-ai/types';
import { scoreResume } from '../../services/ats/scoreResume.js';
import { PublicError } from '../../utils/errors.js';
import type { ResumeEditorRepository } from './resumeRepository.js';

export interface VersionRouteDeps {
  resumes: ResumeEditorRepository;
}

const snapshotBodySchema = z.object({
  name: z.string().min(1).max(120),
});

/** The order a person thinks in: where it came from, what it is now, then history. */
const LABEL_ORDER: Record<ResumeVersion['label'], number> = {
  draft: 0,
  original: 1,
  snapshot: 2,
  'ai-improved': 3,
  'job-tailored': 4,
};

/**
 * Scores every version so the history shows what each one was worth.
 *
 * Deterministic and cheap — no AI — so this is computed on read rather than
 * stored. A stored score would go stale the moment the scoring model changes,
 * and comparing versions scored by different models would be meaningless.
 */
function withScores(versions: ResumeVersion[]) {
  return versions
    .slice()
    .sort(
      (a, b) =>
        LABEL_ORDER[a.label] - LABEL_ORDER[b.label] ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((version) => ({
      id: version.id,
      label: version.label,
      name: version.name,
      revision: version.revision,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      score: scoreResume(version.data as Resume).finalScore,
    }));
}

export function registerVersionRoutes(app: FastifyInstance, deps: VersionRouteDeps): void {
  const { resumes } = deps;

  /**
   * The ownership check every route here starts with.
   *
   * Written once because repeating it is how one route eventually forgets it,
   * and authentication without an ownership filter is not authorization.
   */
  async function ownedResume(request: FastifyRequest<{ Params: { id: string } }>) {
    const user = request.user;
    if (!user) throw new PublicError('Not authenticated', 401);

    const resume = await resumes.findOwned(request.params.id, user.id);
    if (!resume) throw new PublicError('Resume not found.', 404);

    return { user, resume };
  }

  /** The history, each entry with the score it would produce. */
  app.get<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/versions',
    { preHandler: app.requireAuth },
    async (request) => {
      const { user, resume } = await ownedResume(request);
      const versions = await resumes.findVersions(resume.id, user.id);

      return { versions: withScores(versions) };
    },
  );

  /** The full content of one version, for comparing. */
  app.get<{ Params: { id: string; versionId: string } }>(
    '/api/editor/resumes/:id/versions/:versionId',
    { preHandler: app.requireAuth },
    async (request) => {
      const { user, resume } = await ownedResume(request);

      const version = await resumes.findVersion(request.params.versionId, user.id);
      if (!version || version.resumeId !== resume.id) {
        throw new PublicError('That version was not found.', 404);
      }

      return { version, score: scoreResume(version.data as Resume) };
    },
  );

  /** Keeps the current draft under a name. */
  app.post<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/versions',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { user, resume } = await ownedResume(request);

      const body = snapshotBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Give this version a name.' });
      }

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((version) => version.label === 'draft');
      if (!draft) throw new PublicError('This resume has no working draft to save.', 409);

      const saved = await resumes.snapshot({
        resumeId: resume.id,
        userId: user.id,
        name: body.data.name,
        data: draft.data as Resume,
        parentVersionId: draft.id,
      });

      return reply.code(201).send({ version: saved });
    },
  );

  /**
   * Makes an earlier version the working copy.
   *
   * The current draft is kept first, automatically. Restoring replaces
   * everything the user has been editing, and "manage resume variants safely"
   * means that action cannot be the one that loses an afternoon's work —
   * particularly since the click before it is a confirmation, not a preview.
   */
  app.post<{ Params: { id: string; versionId: string } }>(
    '/api/editor/resumes/:id/versions/:versionId/restore',
    { preHandler: app.requireAuth },
    async (request) => {
      const { user, resume } = await ownedResume(request);

      const version = await resumes.findVersion(request.params.versionId, user.id);
      if (!version || version.resumeId !== resume.id) {
        throw new PublicError('That version was not found.', 404);
      }

      if (version.label === 'draft') {
        throw new PublicError('That version is already the working copy.', 409);
      }

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((current) => current.label === 'draft');
      if (!draft) throw new PublicError('This resume has no working draft.', 409);

      const kept = await resumes.snapshot({
        resumeId: resume.id,
        userId: user.id,
        name: `Before restoring "${version.name || version.label}"`,
        data: draft.data as Resume,
        parentVersionId: draft.id,
      });

      const restored = await resumes.saveDraft({
        resumeId: resume.id,
        userId: user.id,
        data: version.data as Resume,
        baseRevision: draft.revision,
      });

      return {
        draft: restored,
        score: scoreResume(restored.data as Resume),
        // Named in the response so the UI can tell the user exactly where their
        // previous work went, rather than leaving them to trust that it did.
        keptAs: { id: kept.id, name: kept.name },
      };
    },
  );

  /** Removes a saved version. The original and the draft are not removable. */
  app.delete<{ Params: { id: string; versionId: string } }>(
    '/api/editor/resumes/:id/versions/:versionId',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { user, resume } = await ownedResume(request);

      const version = await resumes.findVersion(request.params.versionId, user.id);
      if (!version || version.resumeId !== resume.id) {
        return reply.code(404).send({ error: 'That version was not found.' });
      }

      if (version.label === 'original' || version.label === 'draft') {
        return reply.code(409).send({
          error:
            version.label === 'original'
              ? 'Your original upload cannot be deleted — it is what every restore goes back to.'
              : 'The working copy cannot be deleted. Restore another version instead.',
        });
      }

      const deleted = await resumes.deleteVersion(version.id, user.id);
      if (!deleted) return reply.code(404).send({ error: 'That version was not found.' });

      return reply.code(204).send();
    },
  );
}
