import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, ResumeAnalysis } from '@career-lens-ai/types';
import { buildApp } from '../app.js';
import type { AuthVerifier } from '../modules/auth/index.js';
import type { AnonymousSessionStore } from '../modules/resume/anonymousSessionStore.js';
import type {
  ResumeFileRecord,
  ResumeFileRepository,
} from '../modules/resume/resumeFileRepository.js';
import type { ResumeReviewRepository } from '../modules/ai/reviewRepository.js';
import type { ResumeStorage } from '../services/supabase/storage.js';

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  GEMINI_API_KEY: 'test-gemini-key',
  GEMINI_MODEL: 'gemini-3.8-flash',
  CORS_ORIGIN: 'http://localhost:5173',
};

const AUTHED_USER = { id: 'user-1', email: 'jane@example.com' };
const AUTH_HEADER = { authorization: 'Bearer token' };

function resumeBuffer(): Buffer {
  return Buffer.from(
    'Jane Doe\njane@example.com\n\nEXPERIENCE\nEngineer, Acme\n  Built the billing service\n',
    'utf8',
  );
}

function fileRecord(overrides: Partial<ResumeFileRecord> = {}): ResumeFileRecord {
  return {
    id: 'file-1',
    userId: AUTHED_USER.id,
    fileName: 'cv.txt',
    fileType: 'txt',
    fileSize: resumeBuffer().length,
    storagePath: 'user-1/cv.txt',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function analysis(): ResumeAnalysis {
  return {
    pros: ['Clear chronology'],
    cons: ['No measurable outcomes'],
    sectionReviews: [{ section: 'experience', strengths: ['Named employer'], weaknesses: ['Thin'] }],
    priorityActions: [
      { priority: 'high', action: 'Quantify the billing work', reason: 'Numbers differentiate' },
    ],
  };
}

/** A stub provider: these tests must never reach the real Gemini quota. */
function makeDeps() {
  const resumeFiles: ResumeFileRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue(fileRecord()),
    delete: vi.fn().mockResolvedValue(true),
  };

  const reviews: ResumeReviewRepository = {
    findForFile: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: 'review-1',
        resumeFileId: input.resumeFileId,
        userId: input.userId,
        analysis: input.analysis,
        model: input.model,
        createdAt: new Date().toISOString(),
      }),
    ),
  };

  const storage: ResumeStorage = {
    upload: vi.fn(),
    download: vi.fn().mockResolvedValue(resumeBuffer()),
    remove: vi.fn(),
  };

  const anonymousSessions: AnonymousSessionStore = {
    create: vi.fn(),
    findByToken: vi.fn().mockResolvedValue(null),
    markImported: vi.fn(),
    purgeExpired: vi.fn().mockResolvedValue(0),
  };

  const authVerifier: AuthVerifier = {
    verifyToken: vi.fn().mockResolvedValue(AUTHED_USER),
  };

  const aiProvider: AIProvider = {
    analyzeResume: vi.fn().mockResolvedValue(analysis()),
    rewriteSection: vi.fn(),
    analyzeJob: vi.fn(),
    generateSuggestions: vi.fn(),
  };

  return { resumeFiles, reviews, storage, anonymousSessions, authVerifier, aiProvider };
}

describe('AI resume review', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({ method: 'POST', url: '/api/resumes/file-1/review' });

    expect(response.statusCode).toBe(401);
    expect(deps.aiProvider.analyzeResume).not.toHaveBeenCalled();

    await app.close();
  });

  it('generates a review grounded in the stored file', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/file-1/review',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.cached).toBe(false);
    expect(body.review.analysis.pros).toEqual(['Clear chronology']);
    expect(body.review.model).toBe('gemini-3.8-flash');

    // The resume came from storage, not from the request body.
    expect(deps.storage.download).toHaveBeenCalledWith('user-1/cv.txt');

    // The deterministic categories were handed to the model alongside it, so
    // the review can add judgement rather than restate the score.
    const input = vi.mocked(deps.aiProvider.analyzeResume).mock.calls[0]![0];
    expect(input.resume.personal.fullName).toBe('Jane Doe');
    expect(input.atsCategories.length).toBeGreaterThan(0);

    await app.close();
  });

  it('returns the stored review without spending another AI call', async () => {
    vi.mocked(deps.reviews.findForFile).mockResolvedValue({
      id: 'review-1',
      resumeFileId: 'file-1',
      userId: AUTHED_USER.id,
      analysis: analysis(),
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    });

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/file-1/review',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().cached).toBe(true);
    // The whole point of caching: the quota is untouched on a repeat view.
    expect(deps.aiProvider.analyzeResume).not.toHaveBeenCalled();
    expect(deps.storage.download).not.toHaveBeenCalled();

    await app.close();
  });

  it('regenerates only when the user explicitly asks', async () => {
    vi.mocked(deps.reviews.findForFile).mockResolvedValue({
      id: 'review-1',
      resumeFileId: 'file-1',
      userId: AUTHED_USER.id,
      analysis: analysis(),
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    });

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/file-1/review?refresh=true',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    expect(deps.aiProvider.analyzeResume).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('does not review a file belonging to someone else', async () => {
    vi.mocked(deps.resumeFiles.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/someone-elses-file/review',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(404);
    expect(deps.aiProvider.analyzeResume).not.toHaveBeenCalled();

    await app.close();
  });

  it('reports quota exhaustion as a temporary condition, not a broken resume', async () => {
    vi.mocked(deps.aiProvider.analyzeResume).mockRejectedValue(
      new Error('429 RESOURCE_EXHAUSTED: quota exceeded'),
    );

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/file-1/review',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toMatch(/try the review again/i);
    // A failed review must not be stored, or the failure would be cached.
    expect(deps.reviews.save).not.toHaveBeenCalled();

    await app.close();
  });

  it('never leaks provider internals to the client', async () => {
    vi.mocked(deps.aiProvider.analyzeResume).mockRejectedValue(
      new Error('GoogleGenAI: apiKey AIzaSyTOTALLYSECRET rejected at generativelanguage.googleapis.com'),
    );

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/file-1/review',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toMatch(/AIzaSy|googleapis/i);

    await app.close();
  });

  it('reads an existing review without generating one', async () => {
    vi.mocked(deps.reviews.findForFile).mockResolvedValue({
      id: 'review-1',
      resumeFileId: 'file-1',
      userId: AUTHED_USER.id,
      analysis: analysis(),
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    });

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/resumes/file-1/review',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().review.analysis.cons).toEqual(['No measurable outcomes']);
    expect(deps.aiProvider.analyzeResume).not.toHaveBeenCalled();

    await app.close();
  });

  it('reports no review rather than failing when none has been generated', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/resumes/file-1/review',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().review).toBeNull();

    await app.close();
  });
});
