import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resume, ResumeRecord, ResumeVersion } from '@career-lens-ai/types';
import { buildApp } from '../app.js';
import type { AuthVerifier } from '../modules/auth/index.js';
import type { AnonymousSessionStore } from '../modules/resume/anonymousSessionStore.js';
import type { ResumeFileRepository } from '../modules/resume/resumeFileRepository.js';
import type { ResumeReviewRepository } from '../modules/ai/reviewRepository.js';
import type { AiChangeRepository } from '../modules/editor/aiChangeRepository.js';
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

function resumeData(summary: string): Resume {
  return {
    id: 'r1',
    userId: AUTHED_USER.id,
    personal: { fullName: 'Jane Doe' },
    summary,
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

function version(
  id: string,
  label: ResumeVersion['label'],
  summary: string,
  revision = 1,
): ResumeVersion {
  return {
    id,
    resumeId: 'resume-1',
    label,
    name: label === 'snapshot' ? 'Before the rewrite' : label,
    data: resumeData(summary),
    revision,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const DRAFT = () => version('v-draft', 'draft', 'Current working text.', 4);
const ORIGINAL = () => version('v-original', 'original', 'The text as uploaded.');
const SNAPSHOT = () => version('v-snap', 'snapshot', 'A kept working state.');

function makeDeps() {
  const editorResumes: ResumeEditorRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([resumeRecord()]),
    findOwned: vi.fn().mockResolvedValue(resumeRecord()),
    findByFile: vi.fn().mockResolvedValue(null),
    findVersion: vi.fn().mockResolvedValue(SNAPSHOT()),
    findVersions: vi.fn().mockResolvedValue([ORIGINAL(), DRAFT(), SNAPSHOT()]),
    snapshot: vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ ...version('v-new', 'snapshot', input.data.summary), name: input.name }),
      ),
    saveDraft: vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ ...DRAFT(), data: input.data, revision: input.baseRevision + 1 }),
      ),
    deleteVersion: vi.fn().mockResolvedValue(true),
    delete: vi.fn(),
  };

  const resumeFiles: ResumeFileRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  };

  const storage: ResumeStorage = { upload: vi.fn(), download: vi.fn(), remove: vi.fn() };
  const reviews: ResumeReviewRepository = { findForFile: vi.fn(), save: vi.fn() };
  const aiChanges: AiChangeRepository = {
    record: vi.fn(),
    listForResume: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn(),
    markReverted: vi.fn(),
  };
  const anonymousSessions: AnonymousSessionStore = {
    create: vi.fn(),
    findByToken: vi.fn().mockResolvedValue(null),
    markImported: vi.fn(),
    purgeExpired: vi.fn().mockResolvedValue(0),
  };
  const authVerifier: AuthVerifier = { verifyToken: vi.fn().mockResolvedValue(AUTHED_USER) };

  return { editorResumes, resumeFiles, storage, reviews, aiChanges, anonymousSessions, authVerifier };
}

describe('version history', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/versions',
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('scores every version so the history is comparable', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/versions',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    const { versions } = response.json();
    expect(versions).toHaveLength(3);
    for (const entry of versions) expect(entry.score).toBeTypeOf('number');

    await app.close();
  });

  it('leads with the working copy, then the original', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/versions',
      headers: AUTH_HEADER,
    });

    expect(response.json().versions.map((v: { label: string }) => v.label)).toEqual([
      'draft',
      'original',
      'snapshot',
    ]);

    await app.close();
  });

  it('saves the current draft under a name', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/versions',
      headers: AUTH_HEADER,
      payload: { name: 'Before tailoring for Monzo' },
    });

    expect(response.statusCode).toBe(201);
    const saved = vi.mocked(deps.editorResumes.snapshot).mock.calls[0]![0];
    expect(saved.name).toBe('Before tailoring for Monzo');
    // The snapshot is of the draft, not of whatever the browser sent.
    expect(saved.data.summary).toBe('Current working text.');

    await app.close();
  });

  it('refuses an unnamed version rather than creating "Untitled"', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/versions',
      headers: AUTH_HEADER,
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.editorResumes.snapshot).not.toHaveBeenCalled();

    await app.close();
  });

  it('keeps the current work before restoring over it', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/versions/v-snap/restore',
      headers: AUTH_HEADER,
      payload: {},
    });

    expect(response.statusCode).toBe(200);

    // This is what makes restoring safe: an afternoon's editing is not lost to
    // one click, even though the click before it was only a confirmation.
    const kept = vi.mocked(deps.editorResumes.snapshot).mock.calls[0]![0];
    expect(kept.data.summary).toBe('Current working text.');
    expect(kept.name).toMatch(/before restoring/i);

    // And the user is told where it went.
    expect(response.json().keptAs.name).toMatch(/before restoring/i);

    await app.close();
  });

  it('makes the restored version the working copy', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/versions/v-snap/restore',
      headers: AUTH_HEADER,
      payload: {},
    });

    expect(response.json().draft.data.summary).toBe('A kept working state.');
    // Saved against the revision the draft actually held.
    expect(vi.mocked(deps.editorResumes.saveDraft).mock.calls[0]![0].baseRevision).toBe(4);

    await app.close();
  });

  it('can restore the original upload', async () => {
    vi.mocked(deps.editorResumes.findVersion).mockResolvedValue(ORIGINAL());

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/versions/v-original/restore',
      headers: AUTH_HEADER,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().draft.data.summary).toBe('The text as uploaded.');

    await app.close();
  });

  it('refuses to delete the original, which every restore depends on', async () => {
    vi.mocked(deps.editorResumes.findVersion).mockResolvedValue(ORIGINAL());

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/editor/resumes/resume-1/versions/v-original',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(409);
    expect(deps.editorResumes.deleteVersion).not.toHaveBeenCalled();

    await app.close();
  });

  it('refuses to delete the working copy', async () => {
    vi.mocked(deps.editorResumes.findVersion).mockResolvedValue(DRAFT());

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/editor/resumes/resume-1/versions/v-draft',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(409);
    expect(deps.editorResumes.deleteVersion).not.toHaveBeenCalled();

    await app.close();
  });

  it('deletes a saved version', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/editor/resumes/resume-1/versions/v-snap',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(204);
    await app.close();
  });

  it('does not touch a version belonging to another resume', async () => {
    vi.mocked(deps.editorResumes.findVersion).mockResolvedValue({
      ...SNAPSHOT(),
      resumeId: 'someone-elses-resume',
    });

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/editor/resumes/resume-1/versions/v-snap/restore',
      headers: AUTH_HEADER,
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns one version in full, for comparing', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/versions/v-snap',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().version.data.summary).toBe('A kept working state.');
    expect(response.json().score.categories.length).toBeGreaterThan(0);

    await app.close();
  });
});
