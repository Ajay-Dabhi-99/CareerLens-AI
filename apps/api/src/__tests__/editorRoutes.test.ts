import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resume, ResumeRecord, ResumeVersion } from '@career-lens-ai/types';
import { buildApp } from '../app.js';
import type { AuthVerifier } from '../modules/auth/index.js';
import type { AnonymousSessionStore } from '../modules/resume/anonymousSessionStore.js';
import type { ResumeFileRepository } from '../modules/resume/resumeFileRepository.js';
import type { ResumeReviewRepository } from '../modules/ai/reviewRepository.js';
import type { ResumeEditorRepository } from '../modules/editor/resumeRepository.js';
import type { ResumeStorage } from '../services/supabase/storage.js';
import { PublicError } from '../utils/errors.js';

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

function resumeData(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'r1',
    userId: AUTHED_USER.id,
    personal: { fullName: 'Jane Doe', email: 'jane@example.com' },
    summary: 'Engineer.',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
    ...overrides,
  };
}

function resumeRecord(): ResumeRecord {
  return {
    id: 'resume-1',
    userId: AUTHED_USER.id,
    resumeFileId: 'file-1',
    title: 'My resume',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function version(label: ResumeVersion['label'], revision = 1): ResumeVersion {
  return {
    id: `version-${label}`,
    resumeId: 'resume-1',
    label,
    name: label,
    data: resumeData(),
    revision,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeps() {
  const resumeFiles: ResumeFileRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue({
      id: 'file-1',
      userId: AUTHED_USER.id,
      fileName: 'cv.txt',
      fileType: 'txt',
      fileSize: resumeBuffer().length,
      storagePath: 'user-1/cv.txt',
      createdAt: new Date().toISOString(),
    }),
    delete: vi.fn().mockResolvedValue(true),
  };

  const editorResumes: ResumeEditorRepository = {
    create: vi
      .fn()
      .mockResolvedValue({ resume: resumeRecord(), draft: version('draft') }),
    listForUser: vi.fn().mockResolvedValue([resumeRecord()]),
    findOwned: vi.fn().mockResolvedValue(resumeRecord()),
    findVersions: vi.fn().mockResolvedValue([version('original'), version('draft')]),
    saveDraft: vi.fn().mockImplementation((input) =>
      Promise.resolve({ ...version('draft', input.baseRevision + 1), data: input.data }),
    ),
    delete: vi.fn().mockResolvedValue(true),
  };

  const storage: ResumeStorage = {
    upload: vi.fn(),
    download: vi.fn().mockResolvedValue(resumeBuffer()),
    remove: vi.fn(),
  };

  const reviews: ResumeReviewRepository = {
    findForFile: vi.fn().mockResolvedValue(null),
    save: vi.fn(),
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

  return { resumeFiles, editorResumes, storage, reviews, anonymousSessions, authVerifier };
}

describe('resume editor', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication to read a resume', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({ method: 'GET', url: '/api/editor/resumes/resume-1' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('builds an editable resume from the stored file, not from the request body', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes',
      headers: AUTH_HEADER,
      payload: { resumeFileId: 'file-1' },
    });

    expect(response.statusCode).toBe(201);
    expect(deps.storage.download).toHaveBeenCalledWith('user-1/cv.txt');

    const created = vi.mocked(deps.editorResumes.create).mock.calls[0]![0];
    expect(created.data.personal.fullName).toBe('Jane Doe');

    await app.close();
  });

  it('returns the draft alongside the untouched original', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.draft.label).toBe('draft');
    // Without the original there is nothing to revert to, which is the whole
    // reason the parse is stored twice.
    expect(body.original.label).toBe('original');

    await app.close();
  });

  it('scores the draft rather than the upload, so the number follows the edits', async () => {
    const edited = resumeData({ summary: 'A much longer and more detailed summary.' });
    vi.mocked(deps.editorResumes.findVersions).mockResolvedValue([
      version('original'),
      { ...version('draft'), data: edited },
    ]);

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1',
      headers: AUTH_HEADER,
    });

    expect(response.json().score.finalScore).toBeTypeOf('number');
    await app.close();
  });

  it('saves a draft and returns the score for what was just typed', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/editor/resumes/resume-1/draft',
      headers: AUTH_HEADER,
      payload: { data: resumeData({ summary: 'Updated.' }), baseRevision: 1 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.draft.revision).toBe(2);
    expect(body.draft.data.summary).toBe('Updated.');
    expect(body.score.finalScore).toBeTypeOf('number');

    await app.close();
  });

  it('refuses a save based on a revision someone else has already replaced', async () => {
    vi.mocked(deps.editorResumes.saveDraft).mockRejectedValue(
      new PublicError('This resume was changed somewhere else since you started editing.', 409),
    );

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/editor/resumes/resume-1/draft',
      headers: AUTH_HEADER,
      payload: { data: resumeData(), baseRevision: 1 },
    });

    // Silently accepting this would lose whatever the other tab saved.
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/changed somewhere else/i);

    await app.close();
  });

  it('accepts a half-finished resume, because a draft is allowed to be incomplete', async () => {
    const midEdit = resumeData({
      // The user cleared their name to retype it and added an empty role.
      personal: { fullName: '' },
      experience: [{ id: 'e1', company: '', title: '', current: true, bullets: [] }],
    });

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/editor/resumes/resume-1/draft',
      headers: AUTH_HEADER,
      payload: { data: midEdit, baseRevision: 1 },
    });

    // Rejecting this would fail the autosave mid-keystroke and lose the edit.
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('still refuses a payload that is not a resume at all', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/editor/resumes/resume-1/draft',
      headers: AUTH_HEADER,
      payload: { data: { personal: 'not an object' }, baseRevision: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects absurdly large content rather than storing it', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/editor/resumes/resume-1/draft',
      headers: AUTH_HEADER,
      payload: {
        data: resumeData({ summary: 'x'.repeat(50_000) }),
        baseRevision: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });

  it('does not edit a resume belonging to someone else', async () => {
    vi.mocked(deps.editorResumes.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/editor/resumes/someone-elses/draft',
      headers: AUTH_HEADER,
      payload: { data: resumeData(), baseRevision: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });
});
