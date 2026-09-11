import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  MAX_UPLOAD_BYTES,
  validateResumeFile,
} from '../../services/upload/fileValidation.js';
import type { ResumeStorage } from '../../services/supabase/storage.js';
import { extractResumeText } from '../../services/parser/textExtraction.js';
import { parseResumeText } from '../../services/parser/resumeParser.js';
import type { AnonymousSessionStore } from './anonymousSessionStore.js';
import type { ResumeFileRepository } from './resumeFileRepository.js';

export interface ResumeRouteDeps {
  anonymousSessions: AnonymousSessionStore;
  resumeFiles: ResumeFileRepository;
  storage: ResumeStorage;
}

interface ReceivedFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

async function readUploadedFile(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ReceivedFile | null> {
  const file = await request.file();

  if (!file) {
    await reply.code(400).send({ error: 'No file was uploaded.' });
    return null;
  }

  const buffer = await file.toBuffer();

  // @fastify/multipart flags this when the stream exceeded the configured limit.
  if (file.file.truncated) {
    await reply.code(413).send({
      error: `The file is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    });
    return null;
  }

  return { buffer, fileName: file.filename, mimeType: file.mimetype };
}

const importBodySchema = z.object({
  sessionToken: z.string().min(1),
});

export function registerResumeRoutes(app: FastifyInstance, deps: ResumeRouteDeps): void {
  const { anonymousSessions, resumeFiles, storage } = deps;

  /**
   * Public quick analysis. Deliberately scoped: it can only write an anonymous
   * session row, never touch user-owned data, and is rate limited per IP.
   */
  app.post(
    '/api/public/analyze',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '10 minutes' },
      },
    },
    async (request, reply) => {
      const received = await readUploadedFile(request, reply);
      if (!received) return;

      const validation = validateResumeFile(
        received.buffer,
        received.fileName,
        received.mimeType,
      );

      if (!validation.ok) {
        return reply.code(400).send({ error: validation.reason });
      }

      let parsed;
      try {
        const text = await extractResumeText(received.buffer, validation.fileType);
        parsed = parseResumeText(text, {
          fileName: received.fileName,
          fileType: validation.fileType,
        });
      } catch (error) {
        request.log.warn({ err: error }, 'Could not parse uploaded resume');
        return reply.code(422).send({
          error: 'We could not read that file. It may be scanned, image-only or corrupted.',
        });
      }

      // The file itself is not persisted for anonymous users — only the parsed
      // structure and metadata, which expire with the session.
      const { token, session } = await anonymousSessions.create({
        fileName: received.fileName,
        fileType: validation.fileType,
        fileSize: received.buffer.length,
        parsedData: parsed.resume,
      });

      return reply.code(201).send({
        sessionToken: token,
        expiresAt: session.expiresAt,
        file: {
          name: session.fileName,
          type: session.fileType,
          size: session.fileSize,
        },
        resume: parsed.resume,
        detectedSections: parsed.sections.order,
        // Scoring lands in Phase 5.
        metrics: null,
        status: 'parsed',
      });
    },
  );

  app.get<{ Params: { token: string } }>(
    '/api/public/analyze/:token',
    {
      config: {
        rateLimit: { max: 30, timeWindow: '10 minutes' },
      },
    },
    async (request, reply) => {
      const session = await anonymousSessions.findByToken(request.params.token);

      if (!session) {
        return reply.code(404).send({ error: 'This analysis has expired or does not exist.' });
      }

      return {
        expiresAt: session.expiresAt,
        file: { name: session.fileName, type: session.fileType, size: session.fileSize },
        resume: session.parsedData,
        metrics: session.metrics,
        status: session.parsedData ? 'parsed' : 'awaiting-analysis',
      };
    },
  );

  // ------------------------------------------------------------------
  // Authenticated: persisted uploads
  // ------------------------------------------------------------------

  app.post('/api/resumes', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    const received = await readUploadedFile(request, reply);
    if (!received) return;

    const validation = validateResumeFile(received.buffer, received.fileName, received.mimeType);
    if (!validation.ok) {
      return reply.code(400).send({ error: validation.reason });
    }

    let parsed;
    try {
      const text = await extractResumeText(received.buffer, validation.fileType);
      parsed = parseResumeText(text, {
        userId: user.id,
        fileName: received.fileName,
        fileType: validation.fileType,
      });
    } catch (error) {
      request.log.warn({ err: error }, 'Could not parse uploaded resume');
      return reply.code(422).send({
        error: 'We could not read that file. It may be scanned, image-only or corrupted.',
      });
    }

    // Store the original only after parsing succeeds, so a file we cannot read
    // does not leave an orphaned object behind.
    const { storagePath } = await storage.upload(
      user.id,
      received.fileName,
      received.mimeType,
      received.buffer,
    );

    const record = await resumeFiles.create({
      userId: user.id,
      fileName: received.fileName,
      fileType: validation.fileType,
      fileSize: received.buffer.length,
      storagePath,
    });

    return reply.code(201).send({ resumeFile: record, resume: parsed.resume });
  });

  app.get('/api/resumes', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    return { resumeFiles: await resumeFiles.listForUser(user.id) };
  });

  app.delete<{ Params: { id: string } }>(
    '/api/resumes/:id',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const existing = await resumeFiles.findOwned(request.params.id, user.id);
      if (!existing) {
        // Same response whether it is missing or owned by someone else, so this
        // cannot be used to probe for other users' resume ids.
        return reply.code(404).send({ error: 'Resume file not found.' });
      }

      await storage.remove(existing.storagePath);
      await resumeFiles.delete(existing.id, user.id);

      return reply.code(204).send();
    },
  );

  /**
   * Import a temporary anonymous analysis into the signed-in account.
   * Explicit by design — nothing is imported silently.
   */
  app.post('/api/resumes/import', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    const parsed = importBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A sessionToken is required.' });
    }

    const session = await anonymousSessions.findByToken(parsed.data.sessionToken);
    if (!session) {
      return reply.code(404).send({ error: 'This analysis has expired or does not exist.' });
    }

    if (session.importedAt) {
      return reply.code(409).send({ error: 'This analysis has already been imported.' });
    }

    await anonymousSessions.markImported(session.id, user.id);

    return reply.code(201).send({
      imported: {
        fileName: session.fileName,
        fileType: session.fileType,
        fileSize: session.fileSize,
      },
      // The original bytes are not kept for anonymous sessions, so the user is
      // asked to re-upload to attach a stored file to their account.
      requiresReupload: true,
    });
  });
}
