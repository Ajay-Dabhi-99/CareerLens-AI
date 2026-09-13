import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, Resume, ResumeRecord, ResumeVersion } from '@career-lens-ai/types';
import { buildApp } from '../app.js';
import { clearRewriteCache } from '../modules/editor/index.js';
import type { AuthVerifier } from '../modules/auth/index.js';
import type { AnonymousSessionStore } from '../modules/resume/anonymousSessionStore.js';
import type { ResumeFileRepository } from '../modules/resume/resumeFileRepository.js';
import type { ResumeReviewRepository } from '../modules/ai/reviewRepository.js';
import type { ResumeEditorRepository } from '../modules/editor/resumeRepository.js';
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

function resumeData(): Resume {
  return {
    id: 'r1',
    userId: AUTHED_USER.id,
    personal: { fullName: 'Jane Doe' },
    summary: 'Responsible for the billing service.',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
  };
}

function resumeRecord(): ResumeRecord {
  return {
    id: 'resume-1',
    userId: AUTHED_USER.id,
    title: 'My resume',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function draftVersion(): ResumeVersion {
  return {
    id: 'version-draft',
    resumeId: 'resume-1',
    label: 'draft',
    name: 'Working draft',
    data: resumeData(),
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeps() {
  const editorResumes: ResumeEditorRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue(resumeRecord()),
    findByFile: vi.fn().mockResolvedValue(null),
    findVersion: vi.fn().mockResolvedValue(null),
    createTailored: vi.fn(),
    snapshot: vi.fn(),
    deleteVersion: vi.fn().mockResolvedValue(true),
    findVersions: vi.fn().mockResolvedValue([draftVersion()]),
    saveDraft: vi.fn(),
    delete: vi.fn(),
  };

  const aiProvider: AIProvider = {
    analyzeResume: vi.fn(),
    rewriteSection: vi.fn().mockResolvedValue({
      options: [
        {
          text: 'Owned the billing service end to end.',
          explanation: 'Replaces "responsible for" with ownership.',
          requiresVerification: false,
        },
        {
          text: 'Owned billing, cutting failed payments by [X]%.',
          explanation: 'Stronger with a number, which your resume does not contain.',
          requiresVerification: true,
        },
      ],
    }),
    analyzeJob: vi.fn(),
    generateSuggestions: vi.fn(),
    matchRequirements: vi.fn().mockResolvedValue([]),
    suggestTailoring: vi.fn().mockResolvedValue([]),
  };

  const resumeFiles: ResumeFileRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  };

  const storage: ResumeStorage = { upload: vi.fn(), download: vi.fn(), remove: vi.fn() };
  const reviews: ResumeReviewRepository = { findForFile: vi.fn(), save: vi.fn() };
  const anonymousSessions: AnonymousSessionStore = {
    create: vi.fn(),
    findByToken: vi.fn().mockResolvedValue(null),
    markImported: vi.fn(),
    purgeExpired: vi.fn().mockResolvedValue(0),
  };
  const authVerifier: AuthVerifier = { verifyToken: vi.fn().mockResolvedValue(AUTHED_USER) };

  return { editorResumes, aiProvider, resumeFiles, storage, reviews, anonymousSessions, authVerifier };
}

function rewrite(target = 'summary', currentText = 'Responsible for the billing service.') {
  return {
    method: 'POST' as const,
    url: '/api/editor/resumes/resume-1/rewrite',
    headers: AUTH_HEADER,
    payload: { target, currentText },
  };
}

describe('AI rewrite', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    clearRewriteCache();
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/rewrite',
      payload: { target: 'summary', currentText: 'x' },
    });

    expect(response.statusCode).toBe(401);
    expect(deps.aiProvider.rewriteSection).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns options with their explanations and verification flags', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject(rewrite());

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.options).toHaveLength(2);
    expect(body.options[0].explanation).toBeTruthy();
    // The flag is the whole point: an option that needs a fact the resume does
    // not contain must say so rather than being presented as ready to use.
    expect(body.options[1].requiresVerification).toBe(true);

    await app.close();
  });

  it('never writes to the resume, whatever the model returns', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject(rewrite());

    // The safety rule is "never overwrite the user's content automatically".
    // This route has no path to a write at all, which is stronger than a check.
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });

  it('grounds the rewrite in the rest of the resume', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject(rewrite());

    const input = vi.mocked(deps.aiProvider.rewriteSection).mock.calls[0]![0];
    expect(input.target).toBe('summary');
    expect(input.currentText).toBe('Responsible for the billing service.');
    // Without context the model has nothing to draw on and must either stay
    // vague or invent, and inventing is forbidden.
    expect(input.context.personal?.fullName).toBe('Jane Doe');

    await app.close();
  });

  it('does not spend a second call on text that has not changed', async () => {
    const app = await buildApp(testEnv, deps);

    const first = await app.inject(rewrite());
    const second = await app.inject(rewrite());

    expect(first.json().cached).toBe(false);
    expect(second.json().cached).toBe(true);
    expect(deps.aiProvider.rewriteSection).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('treats different text as a different question', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject(rewrite('summary', 'One thing.'));
    await app.inject(rewrite('summary', 'A different thing.'));

    expect(deps.aiProvider.rewriteSection).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('does not serve one user cached options for another user', async () => {
    const app = await buildApp(testEnv, deps);
    await app.inject(rewrite());

    vi.mocked(deps.authVerifier.verifyToken).mockResolvedValue({
      id: 'user-2',
      email: 'someone@else.test',
    });

    const response = await app.inject(rewrite());

    expect(response.json().cached).toBe(false);
    expect(deps.aiProvider.rewriteSection).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('supports every rewrite target the editor offers', async () => {
    const app = await buildApp(testEnv, deps);

    for (const target of ['summary', 'bullet', 'project', 'skills']) {
      const response = await app.inject(rewrite(target, `text for ${target}`));
      expect(response.statusCode).toBe(200);
    }

    await app.close();
  });

  it('rejects an unknown target rather than passing it to the model', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject(rewrite('entire-resume', 'everything'));

    expect(response.statusCode).toBe(400);
    expect(deps.aiProvider.rewriteSection).not.toHaveBeenCalled();

    await app.close();
  });

  it('does not rewrite from a resume belonging to someone else', async () => {
    vi.mocked(deps.editorResumes.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(rewrite());

    expect(response.statusCode).toBe(404);
    expect(deps.aiProvider.rewriteSection).not.toHaveBeenCalled();

    await app.close();
  });

  it('says the resume is safe when the AI is at capacity', async () => {
    vi.mocked(deps.aiProvider.rewriteSection).mockRejectedValue(
      new Error('429 RESOURCE_EXHAUSTED: quota exceeded'),
    );

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(rewrite());

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toMatch(/resume is unaffected/i);

    await app.close();
  });

  it('never leaks provider internals to the client', async () => {
    vi.mocked(deps.aiProvider.rewriteSection).mockRejectedValue(
      new Error('GoogleGenAI: key AIzaSyLEAKED rejected at generativelanguage.googleapis.com'),
    );

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(rewrite());

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toMatch(/AIzaSy|googleapis/i);

    await app.close();
  });
});
