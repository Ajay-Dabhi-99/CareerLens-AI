import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Resume } from '@career-lens-ai/types';
import { scoreResume } from '../../services/ats/scoreResume.js';
import { PublicError } from '../../utils/errors.js';
import type { AiChangeRepository } from './aiChangeRepository.js';
import type { ResumeEditorRepository } from './resumeRepository.js';
import { revertChange } from './revertChange.js';

export interface ChangeRouteDeps {
  resumes: ResumeEditorRepository;
  changes: AiChangeRepository;
}

const MAX_TEXT = 5_000;

const recordBodySchema = z.object({
  target: z.enum(['summary', 'bullet', 'project', 'skills']),
  beforeText: z.string().max(MAX_TEXT),
  afterText: z.string().min(1).max(MAX_TEXT),
  edited: z.boolean().default(false),
});

export function registerChangeRoutes(app: FastifyInstance, deps: ChangeRouteDeps): void {
  const { resumes, changes } = deps;

  /**
   * Records that the user accepted a suggestion.
   *
   * The text itself reaches the resume through the ordinary draft save; this
   * only writes the history that makes the change reversible later. Keeping the
   * two separate means a failure here cannot corrupt the resume, and the record
   * is never a precondition for editing.
   */
  app.post<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/changes',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const body = recordBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'That change could not be recorded.' });
      }

      const resume = await resumes.findOwned(request.params.id, user.id);
      if (!resume) return reply.code(404).send({ error: 'Resume not found.' });

      const change = await changes.record({
        resumeId: resume.id,
        userId: user.id,
        ...body.data,
      });

      return reply.code(201).send({ change });
    },
  );

  /** Everything the AI has changed on this resume, newest first. */
  app.get<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/changes',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const resume = await resumes.findOwned(request.params.id, user.id);
      if (!resume) return reply.code(404).send({ error: 'Resume not found.' });

      return { changes: await changes.listForResume(resume.id, user.id) };
    },
  );

  /**
   * Puts one change back.
   *
   * Done on the server so the read, the edit and the save are one operation
   * against the revision the draft actually holds. Doing it in the browser
   * would race with autosave.
   */
  app.post<{ Params: { id: string; changeId: string } }>(
    '/api/editor/resumes/:id/changes/:changeId/revert',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const resume = await resumes.findOwned(request.params.id, user.id);
      if (!resume) return reply.code(404).send({ error: 'Resume not found.' });

      const change = await changes.findOwned(request.params.changeId, user.id);
      if (!change || change.resumeId !== resume.id) {
        return reply.code(404).send({ error: 'That change was not found.' });
      }

      if (change.revertedAt) {
        return reply.code(409).send({ error: 'That change has already been put back.' });
      }

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((version) => version.label === 'draft');
      if (!draft) throw new PublicError('This resume has no working draft.', 409);

      const result = revertChange(
        draft.data as Resume,
        change.target,
        change.afterText,
        change.beforeText,
      );

      if (!result.ok) {
        // The user has rewritten that line since. Putting the old text back
        // would discard their later work, which is not what "undo the AI" means.
        return reply.code(409).send({
          error:
            'That text has changed since the AI rewrote it, so it was left alone. Edit it directly if you want the earlier wording back.',
        });
      }

      const saved = await resumes.saveDraft({
        resumeId: resume.id,
        userId: user.id,
        data: result.resume,
        baseRevision: draft.revision,
      });

      const reverted = await changes.markReverted(change.id, user.id);

      return {
        change: reverted ?? change,
        draft: saved,
        score: scoreResume(saved.data),
      };
    },
  );
}
