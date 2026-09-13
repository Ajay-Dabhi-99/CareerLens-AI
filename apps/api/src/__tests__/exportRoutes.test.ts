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

function resumeData(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'r1',
    userId: AUTHED_USER.id,
    personal: { fullName: 'Jane Doe', email: 'jane@example.com' },
    summary: 'Backend engineer.',
    skills: [{ id: 's1', category: 'Languages', skills: ['Go'] }],
    experience: [
      {
        id: 'e1',
        company: 'Monzo',
        title: 'Backend Engineer',
        startDate: 'Jan 2021',
        current: true,
        bullets: [{ id: 'b1', text: 'Led the ledger migration', verified: true, source: 'user' }],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
    ...overrides,
  };
}

function version(id: string, label: ResumeVersion['label'], data: Resume): ResumeVersion {
  return {
    id,
    resumeId: 'resume-1',
    label,
    name: label === 'job-tailored' ? 'Tailored for Monzo' : 'Working draft',
    data,
    revision: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeps() {
  const editorResumes: ResumeEditorRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue({
      id: 'resume-1',
      userId: AUTHED_USER.id,
      title: 'My resume',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ResumeRecord),
    findByFile: vi.fn().mockResolvedValue(null),
    findVersion: vi.fn().mockResolvedValue(null),
    findVersions: vi.fn().mockResolvedValue([version('v-draft', 'draft', resumeData())]),
    createTailored: vi.fn(),
    snapshot: vi.fn(),
    saveDraft: vi.fn(),
    deleteVersion: vi.fn(),
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

describe('export', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/docx',
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('reports a clean resume as ready', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/audit',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().audit.ready).toBe(true);
    expect(response.json().version.id).toBe('v-draft');

    await app.close();
  });

  it('serves a Word document named after the person and template', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/docx?template=technical',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('wordprocessingml.document');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="Jane Doe - Technical.docx"',
    );
    // Exposed so the browser lets the client read the file name.
    expect(response.headers['access-control-expose-headers']).toBe('Content-Disposition');
    expect(response.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK');

    await app.close();
  });

  it('refuses to export a resume still carrying a placeholder', async () => {
    vi.mocked(deps.editorResumes.findVersions).mockResolvedValue([
      version('v-draft', 'draft', resumeData({ summary: 'Cut failed payments by [X]%.' })),
    ]);

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/docx',
      headers: AUTH_HEADER,
    });

    // Checked on the server as well as in the UI, so a direct request is not a
    // way to send "[X]%" to an employer.
    expect(response.statusCode).toBe(422);
    expect(response.json().audit.blocking[0].message).toContain('[X]');

    await app.close();
  });

  it('exports the selected version, not the draft', async () => {
    vi.mocked(deps.editorResumes.findVersion).mockResolvedValue(
      version('v-tailored', 'job-tailored', resumeData({ personal: { fullName: 'Tailored Jane', email: 'j@x.com' } })),
    );

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/docx?versionId=v-tailored',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('Tailored Jane');
    expect(deps.editorResumes.findVersion).toHaveBeenCalledWith('v-tailored', AUTHED_USER.id);

    await app.close();
  });

  it('uses the template saved with the resume when none is requested', async () => {
    vi.mocked(deps.editorResumes.findVersions).mockResolvedValue([
      version('v-draft', 'draft', resumeData({ metadata: { templateId: 'executive' } })),
    ]);

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/docx',
      headers: AUTH_HEADER,
    });

    expect(response.headers['content-disposition']).toContain('Executive');

    await app.close();
  });

  it('falls back to the default template rather than failing on an unknown one', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/docx?template=removed-template',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('Modern');

    await app.close();
  });

  it('does not export a version belonging to another resume', async () => {
    vi.mocked(deps.editorResumes.findVersion).mockResolvedValue({
      ...version('v-other', 'snapshot', resumeData()),
      resumeId: 'someone-elses-resume',
    });

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/docx?versionId=v-other',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('does not export a resume belonging to someone else', async () => {
    vi.mocked(deps.editorResumes.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/editor/resumes/resume-1/export/audit',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
