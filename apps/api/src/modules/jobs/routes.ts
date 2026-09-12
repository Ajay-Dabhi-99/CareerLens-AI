import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { extractResumeText } from '../../services/parser/textExtraction.js';
import { MAX_UPLOAD_BYTES, validateResumeFile } from '../../services/upload/fileValidation.js';
import { PublicError } from '../../utils/errors.js';
import type { JobRepository } from './jobRepository.js';

export interface JobRouteDeps {
  jobs: JobRepository;
  /** Recorded against each analysis so a quality change can be traced. */
  model: string;
}

/**
 * Long enough for any real posting, short enough to bound a prompt.
 *
 * A job description goes into an AI call verbatim, so its size is a cost and a
 * safety boundary, not just a database concern.
 */
const MAX_JOB_TEXT = 30_000;
/** Below this it is not a posting, and extraction would invent structure. */
const MIN_JOB_TEXT = 50;

/** Extraction is one AI call per posting; the allowance is per user. */
const ANALYZE_RATE_LIMIT = { max: 15, timeWindow: '1 hour' };

const pasteBodySchema = z.object({
  rawText: z.string().min(MIN_JOB_TEXT).max(MAX_JOB_TEXT),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
});

function userKey(request: FastifyRequest): string {
  return request.user?.id ?? request.ip;
}

function toPublicAiError(error: unknown): PublicError {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new PublicError(
      'The AI is at capacity right now. Your job description is saved — try extracting the requirements again in a few minutes.',
      429,
    );
  }

  return new PublicError(
    'The requirements could not be extracted just now. Your job description is saved — please try again shortly.',
    503,
  );
}

export function registerJobRoutes(app: FastifyInstance, deps: JobRouteDeps): void {
  const { jobs, model } = deps;

  app.get('/api/jobs', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    return { jobs: await jobs.listForUser(user.id) };
  });

  /** Paste. The ordinary path, and the one that needs no file handling. */
  app.post('/api/jobs', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    const body = pasteBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: `Paste the job description text — between ${MIN_JOB_TEXT} and ${MAX_JOB_TEXT} characters.`,
      });
    }

    const job = await jobs.create({
      userId: user.id,
      rawText: body.data.rawText,
      title: body.data.title,
      company: body.data.company,
      source: 'paste',
    });

    return reply.code(201).send({ job });
  });

  /**
   * Upload. Validated by magic bytes like every other upload here — a declared
   * MIME type is a claim by the caller, not a fact about the file.
   *
   * The posting is stored as extracted text rather than as a file: unlike a
   * resume, there is no reason to keep the original bytes, and not storing them
   * is less to protect.
   */
  app.post('/api/jobs/upload', { preHandler: app.requireAuth }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'No file was uploaded.' });

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      return reply.code(413).send({
        error: `The file is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      });
    }

    const validation = validateResumeFile(buffer, file.filename, file.mimetype);
    if (!validation.ok) return reply.code(400).send({ error: validation.reason });

    let rawText: string;
    try {
      rawText = await extractResumeText(buffer, validation.fileType);
    } catch (error) {
      request.log.warn({ err: error }, 'Could not read uploaded job description');
      return reply.code(422).send({
        error: 'We could not read that file. It may be scanned, image-only or corrupted.',
      });
    }

    const trimmed = rawText.trim();
    if (trimmed.length < MIN_JOB_TEXT) {
      return reply.code(422).send({
        error: 'That file did not contain enough readable text to be a job description.',
      });
    }

    const job = await jobs.create({
      userId: user.id,
      rawText: trimmed.slice(0, MAX_JOB_TEXT),
      source: 'upload',
      fileName: file.filename,
    });

    return reply.code(201).send({ job });
  });

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const job = await jobs.findOwned(request.params.id, user.id);
      if (!job) return reply.code(404).send({ error: 'Job description not found.' });

      return { job, analysis: await jobs.findAnalysis(job.id, user.id) };
    },
  );

  /**
   * Extracts requirements, responsibilities and keywords.
   *
   * Stored, and returned unchanged when it already exists: the source text of a
   * posting never changes, so a second extraction would spend quota to learn
   * exactly the same thing.
   */
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/analyze',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { ...ANALYZE_RATE_LIMIT, keyGenerator: userKey } },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const job = await jobs.findOwned(request.params.id, user.id);
      if (!job) return reply.code(404).send({ error: 'Job description not found.' });

      const existing = await jobs.findAnalysis(job.id, user.id);
      if (existing) return reply.send({ analysis: existing, cached: true });

      let analysis;
      try {
        // The posting is untrusted text from an unknown source. The system
        // instruction and the fencing in the prompt treat it as data, and
        // nothing it contains can reach the resume: this call only produces a
        // list of requirements.
        analysis = await app.ai.analyzeJob({ rawJobDescriptionText: job.rawText });
      } catch (error) {
        request.log.warn({ err: error, jobId: job.id }, 'Job analysis failed');
        throw toPublicAiError(error);
      }

      const saved = await jobs.saveAnalysis({
        jobDescriptionId: job.id,
        userId: user.id,
        requirements: analysis.requirements,
        keywords: analysis.keywords,
        model,
      });

      return reply.code(201).send({ analysis: saved, cached: false });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { preHandler: app.requireAuth },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: 'Not authenticated' });

      const deleted = await jobs.delete(request.params.id, user.id);
      if (!deleted) return reply.code(404).send({ error: 'Job description not found.' });

      return reply.code(204).send();
    },
  );
}
