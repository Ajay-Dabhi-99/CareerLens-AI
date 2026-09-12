import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { ServerEnv } from '@career-lens-ai/config';
import {
  createSupabaseAuthVerifier,
  registerAuth,
  registerAuthRoutes,
  type AuthVerifier,
} from './modules/auth/index.js';
import {
  createAnonymousSessionStore,
  createResumeFileRepository,
  registerResumeRoutes,
  type AnonymousSessionStore,
  type ResumeFileRepository,
} from './modules/resume/index.js';
import {
  createResumeReviewRepository,
  registerAiRoutes,
  type ResumeReviewRepository,
} from './modules/ai/index.js';
import {
  createResumeEditorRepository,
  registerEditorRoutes,
  registerRewriteRoutes,
  registerChangeRoutes,
  registerVersionRoutes,
  createAiChangeRepository,
  type ResumeEditorRepository,
  type AiChangeRepository,
} from './modules/editor/index.js';
import {
  createJobRepository,
  registerJobRoutes,
  type JobRepository,
} from './modules/jobs/index.js';
import { createGeminiProvider, DEFAULT_MODEL } from './services/ai/index.js';
import type { AIProvider } from '@career-lens-ai/types';
import { createSupabaseAdminClient } from './services/supabase/client.js';
import { createResumeStorage, type ResumeStorage } from './services/supabase/storage.js';
import { MAX_UPLOAD_BYTES } from './services/upload/fileValidation.js';
import { PublicError, SetupError, asSetupErrorIfMissingTable } from './utils/errors.js';

export interface BuildAppOptions {
  /** Overrides let tests run without a live Supabase project or AI quota. */
  authVerifier?: AuthVerifier;
  anonymousSessions?: AnonymousSessionStore;
  resumeFiles?: ResumeFileRepository;
  storage?: ResumeStorage;
  reviews?: ResumeReviewRepository;
  editorResumes?: ResumeEditorRepository;
  aiChanges?: AiChangeRepository;
  jobs?: JobRepository;
  aiProvider?: AIProvider;
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Routes depend on this interface, never on the Gemini SDK, so the provider
     * can be swapped or stubbed without touching route code.
     */
    ai: AIProvider;
  }
}

export async function buildApp(
  env: ServerEnv,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
    },
  });
  // Global ceiling; public upload routes tighten this further per route.
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });

  /**
   * Clients never see raw internal errors. 4xx messages we raised deliberately are
   * safe to pass through; everything else is logged in full and reported generically,
   * so database internals and stack details stay server-side.
   */
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const setupError = error instanceof SetupError ? error : asSetupErrorIfMissingTable(error.message);

    if (setupError) {
      request.log.error(
        { err: error, hint: setupError.hint },
        `Setup incomplete: ${setupError.message} ${setupError.hint}`,
      );
      return reply.code(503).send({
        error: 'The service is not fully configured yet. Please try again shortly.',
      });
    }

    if (error instanceof PublicError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    // Fastify attaches statusCode for things like payload-too-large and rate limits.
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: error.message });
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send({ error: 'Something went wrong. Please try again.' });
  });

  const needsSupabase =
    !options.authVerifier ||
    !options.anonymousSessions ||
    !options.resumeFiles ||
    !options.storage ||
    !options.reviews ||
    !options.editorResumes ||
    !options.aiChanges ||
    !options.jobs;
  const supabase = needsSupabase ? createSupabaseAdminClient(env) : null;

  const authVerifier =
    options.authVerifier ?? createSupabaseAuthVerifier(supabase!);
  registerAuth(app, authVerifier);

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'career-lens-ai-api',
    timestamp: new Date().toISOString(),
  }));

  app.decorate(
    'ai',
    options.aiProvider ??
      createGeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        logger: {
          warn: (details, message) => app.log.warn(details, message),
          error: (details, message) => app.log.error(details, message),
        },
      }),
  );

  registerAuthRoutes(app);

  const resumeFiles = options.resumeFiles ?? createResumeFileRepository(supabase!);
  const storage = options.storage ?? createResumeStorage(supabase!);

  registerResumeRoutes(app, {
    anonymousSessions: options.anonymousSessions ?? createAnonymousSessionStore(supabase!),
    resumeFiles,
    storage,
  });

  registerAiRoutes(app, {
    resumeFiles,
    storage,
    reviews: options.reviews ?? createResumeReviewRepository(supabase!),
    model: env.GEMINI_MODEL ?? DEFAULT_MODEL,
  });

  const editorResumes = options.editorResumes ?? createResumeEditorRepository(supabase!);

  registerEditorRoutes(app, { resumes: editorResumes, resumeFiles, storage });
  registerRewriteRoutes(app, { resumes: editorResumes });
  registerVersionRoutes(app, { resumes: editorResumes });
  registerJobRoutes(app, {
    jobs: options.jobs ?? createJobRepository(supabase!),
    model: env.GEMINI_MODEL ?? DEFAULT_MODEL,
  });
  registerChangeRoutes(app, {
    resumes: editorResumes,
    changes: options.aiChanges ?? createAiChangeRepository(supabase!),
  });

  return app;
}
