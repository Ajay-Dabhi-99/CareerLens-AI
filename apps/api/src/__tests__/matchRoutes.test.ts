import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, Resume, ResumeRecord, ResumeVersion } from '@career-lens-ai/types';
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
  // Found by keyword lookup: the resume names Go.
  { id: 'r1', text: 'Go', category: 'skill' as const, required: true },
  // Not findable by keyword: "mentoring" appears nowhere, but might be meant.
  { id: 'r2', text: 'Mentoring junior engineers', category: 'responsibility' as const, required: false },
];

function draftVersion(): ResumeVersion {
  return {
    id: 'v-draft',
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
  const jobs: JobRepository = {
    create: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue({
      id: 'job-1',
      userId: AUTHED_USER.id,
      rawText: 'posting',
      source: 'paste' as const,
      createdAt: new Date().toISOString(),
    }),
    delete: vi.fn(),
    findAnalysis: vi.fn().mockResolvedValue({
      id: 'analysis-1',
      jobDescriptionId: 'job-1',
      requirements: REQUIREMENTS,
      keywords: ['Go'],
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    }),
    saveAnalysis: vi.fn(),
  };

  const jobMatches: JobMatchRepository = {
    findForPair: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockImplementation((input) =>
      Promise.resolve({ id: 'match-1', createdAt: new Date().toISOString(), ...input }),
    ),
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
    } as ResumeRecord),
    findByFile: vi.fn().mockResolvedValue(null),
    findVersion: vi.fn().mockResolvedValue(null),
    findVersions: vi.fn().mockResolvedValue([draftVersion()]),
    createTailored: vi.fn(),
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
    suggestTailoring: vi.fn().mockResolvedValue([]),
    matchRequirements: vi.fn().mockResolvedValue([
      { requirementId: 'r2', state: 'partial', evidence: 'Led the ledger migration', confidence: 0.6 },
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

function matchRequest() {
  return {
    method: 'POST' as const,
    url: '/api/jobs/job-1/match',
    headers: AUTH_HEADER,
    payload: { resumeId: 'resume-1' },
  };
}

describe('job match', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/match',
      payload: { resumeId: 'resume-1' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('settles by keyword what it can, and asks the AI only for the rest', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject(matchRequest());

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.settledByKeyword).toBe(1);
    expect(body.judgedByAi).toBe(1);

    // Only the unfindable requirement travelled, so the quota is spent on the
    // one case that genuinely needed reading.
    const sent = vi.mocked(deps.aiProvider.matchRequirements).mock.calls[0]![0];
    expect(sent.requirements.map((r) => r.id)).toEqual(['r2']);

    await app.close();
  });

  it('quotes a line of the resume for what it matched', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject(matchRequest());
    const keyword = response
      .json()
      .match.matches.find((m: { requirementId: string }) => m.requirementId === 'r1');

    expect(keyword.state).toBe('matched');
    expect(keyword.evidence).toBeTruthy();

    await app.close();
  });

  it('computes the score itself and never asks the model for it', async () => {
    const app = await buildApp(testEnv, deps);

    const response = await app.inject(matchRequest());
    const saved = vi.mocked(deps.jobMatches.save).mock.calls[0]![0];

    expect(saved.matchScore).toBeTypeOf('number');
    expect(saved.matchScore).toBeGreaterThan(0);
    expect(saved.matchScore).toBeLessThanOrEqual(100);
    expect(response.json().match.matchScore).toBe(saved.matchScore);

    await app.close();
  });

  it('still answers when the AI half fails, without claiming anything it did not check', async () => {
    vi.mocked(deps.aiProvider.matchRequirements).mockRejectedValue(
      new Error('429 RESOURCE_EXHAUSTED'),
    );

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(matchRequest());

    expect(response.statusCode).toBe(201);

    const saved = vi.mocked(deps.jobMatches.save).mock.calls[0]![0];
    const unjudged = saved.matches.find((m) => m.requirementId === 'r2');

    // Reporting it as "missing" would be a claim about the candidate that we
    // never actually checked.
    expect(unjudged!.state).toBe('needsVerification');

    const keyword = saved.matches.find((m) => m.requirementId === 'r1');
    expect(keyword!.state).toBe('matched');

    await app.close();
  });

  it('refuses to match a posting whose requirements were never extracted', async () => {
    vi.mocked(deps.jobs.findAnalysis).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(matchRequest());

    expect(response.statusCode).toBe(409);
    expect(deps.aiProvider.matchRequirements).not.toHaveBeenCalled();

    await app.close();
  });

  it('does not spend a call on a pair already matched', async () => {
    vi.mocked(deps.jobMatches.findForPair).mockResolvedValue({
      id: 'match-1',
      userId: AUTHED_USER.id,
      resumeVersionId: 'v-draft',
      jobAnalysisId: 'analysis-1',
      matchScore: 72,
      matches: [],
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    });

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(matchRequest());

    expect(response.json().cached).toBe(true);
    expect(deps.aiProvider.matchRequirements).not.toHaveBeenCalled();

    await app.close();
  });

  it('matches the version, not the resume, so an edit does not silently change the answer', async () => {
    const app = await buildApp(testEnv, deps);

    await app.inject(matchRequest());
    const saved = vi.mocked(deps.jobMatches.save).mock.calls[0]![0];

    expect(saved.resumeVersionId).toBe('v-draft');

    await app.close();
  });

  it('does not match a posting belonging to someone else', async () => {
    vi.mocked(deps.jobs.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(matchRequest());

    expect(response.statusCode).toBe(404);
    expect(deps.aiProvider.matchRequirements).not.toHaveBeenCalled();

    await app.close();
  });

  it('does not match against a resume belonging to someone else', async () => {
    vi.mocked(deps.editorResumes.findOwned).mockResolvedValue(null);

    const app = await buildApp(testEnv, deps);
    const response = await app.inject(matchRequest());

    expect(response.statusCode).toBe(404);
    expect(deps.aiProvider.matchRequirements).not.toHaveBeenCalled();

    await app.close();
  });

  it('reads an existing match without generating one', async () => {
    vi.mocked(deps.jobMatches.findForPair).mockResolvedValue({
      id: 'match-1',
      userId: AUTHED_USER.id,
      resumeVersionId: 'v-draft',
      jobAnalysisId: 'analysis-1',
      matchScore: 72,
      matches: [],
      model: 'gemini-3.8-flash',
      createdAt: new Date().toISOString(),
    });

    const app = await buildApp(testEnv, deps);

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/match?resumeId=resume-1',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().match.matchScore).toBe(72);
    expect(deps.aiProvider.matchRequirements).not.toHaveBeenCalled();

    await app.close();
  });
});
