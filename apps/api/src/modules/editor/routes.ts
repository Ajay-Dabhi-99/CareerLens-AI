import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resumeDraftSchema } from '@career-lens-ai/validation';
import type { Resume } from '@career-lens-ai/types';
import { scoreResume } from '../../services/ats/scoreResume.js';
import { extractResumeText } from '../../services/parser/textExtraction.js';
import { parseResumeText } from '../../services/parser/resumeParser.js';
import type { ResumeStorage } from '../../services/supabase/storage.js';
import type { ResumeFileRepository } from '../resume/resumeFileRepository.js';
import { PublicError } from '../../utils/errors.js';
import type { ResumeEditorRepository } from './resumeRepository.js';

export interface EditorRouteDeps {
  resumes: ResumeEditorRepository;
  resumeFiles: ResumeFileRepository;
  storage: ResumeStorage;
}

const createBodySchema = z.object({
  resumeFileId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
});

const saveDraftBodySchema = z.object({
  data: resumeDraftSchema,
  /** The revision this edit was based on; a stale value is refused with 409. */
  baseRevision: z.number().int().nonnegative(),
});

export function registerEditorRoutes(app: FastifyInstance, deps: EditorRouteDeps): void {
  const { resumes, resumeFiles, storage } = deps;

  app.get('/api/editor/resumes', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    return { resumes: await resumes.listForUser(user.id) };
  });

  /**
   * Turns an uploaded file into an editable resume.
   *
   * Explicit rather than automatic on upload: creating persistent, user-owned
   * rows is something the user asks for. The parse is stored twice, as the
   * immutable original and as the draft, so reverting is always possible.
   */
  app.post('/api/editor/resumes', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    const body = createBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'A resumeFileId is required.' });
    }

    const file = await resumeFiles.findOwned(body.data.resumeFileId, user.id);
    if (!file) {
      return reply.code(404).send({ error: 'Resume file not found.' });
    }

    // Parsed from the stored original rather than from anything the browser
    // sends, for the same reason the AI review is: this becomes the user's
    // source of truth, so it has to come from the document they uploaded.
    let parsedResume: Resume;
    try {
      const buffer = await storage.download(file.storagePath);
      const text = await extractResumeText(buffer, file.fileType);
      parsedResume = parseResumeText(text, {
        userId: user.id,
        fileName: file.fileName,
        fileType: file.fileType,
      }).resume;
    } catch {
      throw new PublicError(
        'We could not read that file to build an editable resume. Try uploading it again.',
        422,
      );
    }

    const { resume, draft } = await resumes.create({
      userId: user.id,
      resumeFileId: file.id,
      title: body.data.title ?? file.fileName.replace(/\.[^.]+$/, ''),
      data: parsedResume,
    });

    return reply.code(201).send({ resume, draft });
  });

  app.get<{ Params: { id: string } }>(
    '/api/editor/resumes/:id',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const resume = await resumes.findOwned(request.params.id, user.id);
      if (!resume) {
        return reply.code(404).send({ error: 'Resume not found.' });
      }

      const versions = await resumes.findVersions(resume.id, user.id);
      const draft = versions.find((version) => version.label === 'draft');
      const original = versions.find((version) => version.label === 'original');

      if (!draft) {
        // A resume without a draft cannot be edited, and silently creating one
        // would paper over a data fault we should see.
        throw new PublicError('This resume has no working draft to edit.', 409);
      }

      return {
        resume,
        draft,
        // Returned so the editor can offer "revert to my original" without a
        // second request, and so the user can always see what they started with.
        original: original ?? null,
        // Scored live from the draft: the number must follow the edits, not the
        // upload, or the editor would show a stale verdict on changed text.
        score: scoreResume(draft.data),
      };
    },
  );

  /**
   * Autosave target. Debounced by the client; guarded by revision here.
   */
  app.put<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/draft',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const body = saveDraftBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: 'That resume could not be saved because it was not in the expected format.',
          issues: body.error.issues.map((issue) => issue.path.join('.')).slice(0, 10),
        });
      }

      const resume = await resumes.findOwned(request.params.id, user.id);
      if (!resume) {
        return reply.code(404).send({ error: 'Resume not found.' });
      }

      const saved = await resumes.saveDraft({
        resumeId: resume.id,
        userId: user.id,
        data: body.data.data as Resume,
        baseRevision: body.data.baseRevision,
      });

      // The score is returned with every save so the editor can show the effect
      // of a change as it is made, which is the point of editing in here rather
      // than in a word processor.
      return { draft: saved, score: scoreResume(saved.data) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/editor/resumes/:id',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const deleted = await resumes.delete(request.params.id, user.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'Resume not found.' });
      }

      return reply.code(204).send();
    },
  );
}
