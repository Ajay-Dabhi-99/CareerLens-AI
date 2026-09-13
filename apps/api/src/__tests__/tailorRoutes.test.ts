import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, Resume, ResumeVersion } from '@career-lens-ai/types';
import { buildApp } from '../app.js';
import type { AuthVerifier } from '../modules/auth/index.js';
import type { AnonymousSessionStore } from '../modules/resume/anonymousSessionStore.js';
import type { ResumeFileRepository } from '../modules/resume/resumeFileRepository.js';
import type { ResumeReviewRepository } from '../modules/ai/reviewRepository.js';
import type { ResumeEditorRepository } from '../modules/editor/resumeRepository.js';
import type { AiChangeRepository } from '../modules/editor/aiChangeRepository.js';
import type { JobRepository } from '../modules/jobs/jobRepository.js';
import type { JobMatchRepository } from '../modules/jobs/matchRepository.js';
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
    summary: 'Backend engineer.',
    skills: [{ id: 's1', category: 'Languages', skills: ['Go'] }],
    experience: [
      {
        id: 'e1',
        company: 'Monzo',
        title: 'Backend Engineer',
        current: true,
        bullets: [{ id: 'b1', text: 'Led the ledger migration', verified: true, source: 'user' }],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
  };
}

const REQUIREMENTS = [
  { id: 'r1', text: 'Go', category: 'skill' as const, required: true },
  { id: 'r2', text: 'Mentoring', category: 'responsibility' as const, required: true },
  { id: 'r3', text: 'Kubernetes', category: 'skill' as const, required: false },
];

function draftVersion(): ResumeVersion {
  return {
    id: 'v-draft',
    resumeId: 'resume-1',
    label: 'draft',
    name: 'Working draft',
    data: resumeData(),
    revision: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeps() {
  const jobs: JobRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue({
      id: 'job-1',
      userId: AUTHED_USER.id,
      rawText: 'posting',
      title: 'Senior Backend Engineer',
      company: 'Monzo',
      source: 'paste' as const,
      createdAt: new Date().toISOString(),
    }),
    delete: vi.fn(),
    findAnalysis: vi.fn().mockResolvedValue({
      id: 'analysis-1',
      jobDescriptionId: 'job-1',
      requirements: REQUIREMENTS,
      keywords: [],
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    }),
    saveAnalysis: vi.fn(),
  };

  const jobMatches: JobMatchRepository = {
    findForPair: vi.fn().mockResolvedValue({
      id: 'match-1',
      userId: AUTHED_USER.id,
      resumeVersionId: 'v-draft',
      jobAnalysisId: 'analysis-1',
      matchScore: 55,
      matches: [
        { id: 'r1', requirementId: 'r1', state: 'matched', evidence: 'Go', confidence: 0.9 },
        { id: 'r2', requirementId: 'r2', state: 'needsVerification', confidence: 0.4 },
        { id: 'r3', requirementId: 'r3', state: 'missing', confidence: 0.9 },
      ],
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    }),
    save: vi.fn(),
  };

  const editorResumes: ResumeEditorRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue({
      id: 'resume-1',
      userId: AUTHED_USER.id,
      title: 'My resume',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    findByFile: vi.fn().mockResolvedValue(null),
    findVersion: vi.fn().mockResolvedValue(null),
    findVersions: vi.fn().mockResolvedValue([draftVersion()]),
    createTailored: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        ...draftVersion(),
        id: 'v-tailored',
        label: 'job-tailored',
        name: input.name,
        data: input.data,
      }),
    ),
    snapshot: vi.fn(),
    saveDraft: vi.fn(),
    deleteVersion: vi.fn(),
    delete: vi.fn(),
  };

  const aiProvider: AIProvider = {
    analyzeResume: vi.fn(),
    rewriteSection: vi.fn(),
    analyzeJob: vi.fn(),
    generateSuggestions: vi.fn(),
    matchRequirements: vi.fn(),
    suggestTailoring: vi.fn().mockResolvedValue([
      {
        id: 'sug-1',
        section: 'summary',
        priority: 'high',
        issue: 'The summary leads with backend generally, not with the ledger work.',
        whyItMatters: 'This posting is about payments.',
        originalText: 'Backend engineer.',
        suggestedText: 'Backend engineer who led a ledger migration.',
        requiresVerification: false,
        confidence: 0.8,
      },
    ]),
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

  return {
    jobs,
    jobMatches,
    editorResumes,
    aiProvider,
    resumeFiles,
    storage,
    reviews,
    aiChanges,
    anonymousSessions,
    authVerifier,
  };
}

const suggest = {
  method: 'POST' as const,
  url: '/api/jobs/job-1/tailor',
  headers: AUTH_HEADER,
  payload: { resumeId: 'resume-1' },
};

describe('tailoring', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/tailor',
      payload: { resumeId: 'resume-1' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('cannot write to the resume at all', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject(suggest);

    // The phase's promise is "tailor without damaging the master resume". This
    // route has no path to a write, which is stronger than being careful.
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();
    expect(deps.editorResumes.createTailored).not.toHaveBeenCalled();

    await app.close();
  });

  it('works only on what the resume does not already show', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject(suggest);

    const sent = vi.mocked(deps.aiProvider.suggestTailoring).mock.calls[0]![0];
    const asked = sent.gaps.map((gap) => gap.requirement);

    // Go is already matched; suggesting changes to it would be work on
    // something that is finished.
    expect(asked).not.toContain('Go');
    expect(asked).toEqual(expect.arrayContaining(['Mentoring', 'Kubernetes']));

    await app.close();
  });

  it('tells the model which role it is tailoring for', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject(suggest);

    const sent = vi.mocked(deps.aiProvider.suggestTailoring).mock.calls[0]![0];
    expect(sent.role).toBe('Senior Backend Engineer at Monzo');

    await app.close();
  });

  it('says so plainly when there is nothing to tailor', async () => {
    vi.mocked(deps.jobMatches.findForPair).mockResolvedValue({
      id: 'match-1',
      userId: AUTHED_USER.id,
      resumeVersionId: 'v-draft',
      jobAnalysisId: 'analysis-1',
      matchScore: 100,
      matches: REQUIREMENTS.map((requirement) => ({
        id: requirement.id,
        requirementId: requirement.id,
        state: 'matched' as const,
        confidence: 0.9,
      })),
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    });

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(suggest);

    expect(response.json().suggestions).toEqual([]);
    // Spending a call to be told there is nothing to do would be waste.
    expect(deps.aiProvider.suggestTailoring).not.toHaveBeenCalled();

    await app.close();
  });

  it('refuses to tailor before the resume has been compared', async () => {
    vi.mocked(deps.jobMatches.findForPair).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(suggest);

    // Without a match it would be suggesting changes to things already fine,
    // and guessing at the rest.
    expect(response.statusCode).toBe(409);
    expect(deps.aiProvider.suggestTailoring).not.toHaveBeenCalled();

    await app.close();
  });

  it('creates a new version and leaves the draft alone', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/tailored',
      headers: AUTH_HEADER,
      payload: {
        resumeId: 'resume-1',
        name: 'Tailored for Monzo',
        data: resumeData(),
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().version.label).toBe('job-tailored');
    expect(response.json().score.finalScore).toBeTypeOf('number');

    // The working copy is untouched: a tailored resume is a sibling, not a
    // replacement.
    expect(deps.editorResumes.saveDraft).not.toHaveBeenCalled();

    await app.close();
  });

  it('records which version the tailored one came from', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/tailored',
      headers: AUTH_HEADER,
      payload: { resumeId: 'resume-1', name: 'Tailored for Monzo', data: resumeData() },
    });

    expect(vi.mocked(deps.editorResumes.createTailored).mock.calls[0]![0].parentVersionId).toBe(
      'v-draft',
    );

    await app.close();
  });

  it('refuses a tailored version that is not a resume', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/tailored',
      headers: AUTH_HEADER,
      payload: { resumeId: 'resume-1', name: 'Broken', data: { personal: 'not an object' } },
    });

    expect(response.statusCode).toBe(400);
    expect(deps.editorResumes.createTailored).not.toHaveBeenCalled();

    await app.close();
  });

  it('does not tailor against a resume belonging to someone else', async () => {
    vi.mocked(deps.editorResumes.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(suggest);

    expect(response.statusCode).toBe(404);
    expect(deps.aiProvider.suggestTailoring).not.toHaveBeenCalled();

    await app.close();
  });

  it('says nothing has changed when the AI fails', async () => {
    vi.mocked(deps.aiProvider.suggestTailoring).mockRejectedValue(
      new Error('429 RESOURCE_EXHAUSTED'),
    );

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(suggest);

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toMatch(/nothing has changed/i);

    await app.close();
  });
});
