import { authedFetch } from '@/lib/api';

export type MatchState = 'matched' | 'partial' | 'missing' | 'needsVerification';

export interface SkillMatch {
  id: string;
  requirementId: string;
  state: MatchState;
  /** A verbatim line from the resume. Absent when nothing could be quoted. */
  evidence?: string;
  confidence: number;
}

export interface JobMatch {
  id: string;
  resumeVersionId: string;
  jobAnalysisId: string;
  matchScore: number;
  matches: SkillMatch[];
  createdAt: string;
}

export interface MatchRunResult {
  match: JobMatch;
  cached: boolean;
  /** How many verdicts were read from the resume rather than judged. */
  settledByKeyword?: number;
  judgedByAi?: number;
}

export async function runMatch(jobId: string, resumeId: string): Promise<MatchRunResult> {
  const response = await authedFetch(`/api/jobs/${jobId}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeId }),
  });
  return (await response.json()) as MatchRunResult;
}

/** Reads an existing match. Costs nothing, so the page may call it on open. */
export async function getMatch(jobId: string, resumeId: string): Promise<JobMatch | null> {
  const response = await authedFetch(
    `/api/jobs/${jobId}/match?resumeId=${encodeURIComponent(resumeId)}`,
  );
  const body = (await response.json()) as { match: JobMatch | null };
  return body.match;
}
