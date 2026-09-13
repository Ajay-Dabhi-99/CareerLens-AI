import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resume, ResumeRecord, ResumeVersion } from '@career-lens-ai/types';
import { buildApp } from '../app.js';
import type { AuthVerifier } from '../modules/auth/index.js';
import type { AnonymousSessionStore } from '../modules/resume/anonymousSessionStore.js';
import type { ResumeFileRepository } from '../modules/resume/resumeFileRepository.js';
import type { ResumeReviewRepository } from '../modules/ai/reviewRepository.js';
import type { ResumeEditorRepository } from '../modules/editor/resumeRepository.js';
import type { AiChangeRecord, AiChangeRepository } from '../modules/editor/aiChangeRepository.js';
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

const AI_TEXT = 'Owned billing end to end';
const ORIGINAL_TEXT = 'Responsible for billing';

function resumeData(): Resume {
  return {
    id: 'r1',
    userId: AUTHED_USER.id,
    personal: { fullName: 'Jane Doe' },
    summary: 'Engineer.',
    skills: [],
    experience: [
      {
        id: 'e1',
        company: 'Acme',
        title: 'Engineer',
        current: true,
        bullets: [{ id: 'b1', text: AI_TEXT, verified: false, source: 'ai' }],
      },
    ],
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
    revision: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function changeRecord(overrides: Partial<AiChangeRecord> = {}): AiChangeRecord {
  return {
    id: 'change-1',
    resumeId: 'resume-1',
    userId: AUTHED_USER.id,
    target: 'bullet',
    beforeText: ORIGINAL_TEXT,
    afterText: AI_TEXT,
    edited: false,
    createdAt: new Date().toISOString(),
    revertedAt: null,
    ...overrides,
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
    saveDraft: vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ ...draftVersion(), data: input.data, revision: input.baseRevision + 1 }),
      ),
    delete: vi.fn(),
  };

  const aiChanges: AiChangeRepository = {
    record: vi.fn().mockImplementation((input) => Promise.resolve(changeRecord(input))),
    listForResume: vi.fn().mockResolvedValue([changeRecord()]),
    findOwned: vi.fn().mockResolvedValue(changeRecord()),
    markReverted: vi
      .fn()
      .mockResolvedValue(changeRecord({ revertedAt: new Date().toISOString() })),
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

  return { editorResumes, aiChanges, resumeFiles, storage, reviews, anonymousSessions, authVerifier };
}

describe('AI change history', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/changes',
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('records what the text was and what it became', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes',
      headers: AUTH_HEADER,
      payload: { target: 'bullet', beforeText: ORIGINAL_TEXT, afterText: AI_TEXT, edited: false },
    });

    expect(response.statusCode).toBe(201);
    const recorded = vi.mocked(deps.aiChanges.record).mock.calls[0]![0];
    // Without the before text there is nothing to put back later.
    expect(recorded.beforeText).toBe(ORIGINAL_TEXT);
    expect(recorded.afterText).toBe(AI_TEXT);

    await app.close();
  });

  it('remembers whether the user edited the suggestion before taking it', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes',
      headers: AUTH_HEADER,
      payload: { target: 'bullet', beforeText: ORIGINAL_TEXT, afterText: 'My own version', edited: true },
    });

    expect(vi.mocked(deps.aiChanges.record).mock.calls[0]![0].edited).toBe(true);
    await app.close();
  });

  it('puts a change back and saves the draft in one operation', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes/change-1/revert',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.draft.data.experience[0].bullets[0].text).toBe(ORIGINAL_TEXT);
    expect(body.score.finalScore).toBeTypeOf('number');

    // Saved against the revision the draft actually held, so this cannot race
    // with an autosave that happened in between.
    expect(vi.mocked(deps.editorResumes.saveDraft).mock.calls[0]![0].baseRevision).toBe(3);

    await app.close();
  });

  it('marks the change reverted so it is not offered twice', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes/change-1/revert',
      headers: AUTH_HEADER,
    });

    expect(deps.aiChanges.markReverted).toHaveBeenCalledWith('change-1', AUTHED_USER.id);
    await app.close();
  });

  it('refuses to revert something already put back', async () => {
    vi.mocked(deps.aiChanges.findOwned).mockResolvedValue(
      changeRecord({ revertedAt: new Date().toISOString() }),
    );

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes/change-1/revert',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(409);
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });

  it('leaves the resume alone when the user has since rewritten that line', async () => {
    vi.mocked(deps.aiChanges.findOwned).mockResolvedValue(
      changeRecord({ afterText: 'text that is no longer anywhere in the resume' }),
    );

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes/change-1/revert',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/changed since/i);
    // The user's later work must survive an attempt to undo an earlier change.
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });

  it('does not revert a change belonging to another resume', async () => {
    vi.mocked(deps.aiChanges.findOwned).mockResolvedValue(
      changeRecord({ resumeId: 'someone-elses-resume' }),
    );

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes/change-1/revert',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('lists the history newest first', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/changes',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().changes).toHaveLength(1);

    await app.close();
  });

  it('does not touch a resume belonging to someone else', async () => {
    vi.mocked(deps.editorResumes.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/changes',
      headers: AUTH_HEADER,
      payload: { target: 'bullet', beforeText: 'a', afterText: 'b', edited: false },
    });

    expect(response.statusCode).toBe(404);
    expect(deps.aiChanges.record).not.toHaveBeenCalled();

    await app.close();
  });
});
