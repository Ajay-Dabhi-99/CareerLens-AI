import { authedFetch } from '@/lib/api';
import type { FullScore } from '@/features/resume/api/resumeApi';

export type ReviewPriority = 'high' | 'medium' | 'low';

export interface SectionReview {
  section: string;
  strengths: string[];
  weaknesses: string[];
}

export interface ResumeAnalysis {
  pros: string[];
  cons: string[];
  sectionReviews: SectionReview[];
  priorityActions: Array<{ priority: ReviewPriority; action: string; reason: string }>;
}

export interface StoredReview {
  analysis: ResumeAnalysis;
  model: string;
  createdAt: string;
}

/**
 * Reads a review that already exists. Costs nothing, so the page can call it on
 * mount without spending anyone's AI quota.
 */
export async function getReview(resumeFileId: string): Promise<StoredReview | null> {
  const response = await authedFetch(`/api/resumes/${resumeFileId}/review`);
  const body = (await response.json()) as { review: StoredReview | null };
  return body.review;
}

export interface GeneratedReview {
  review: StoredReview;
  score?: FullScore;
  cached: boolean;
}

/**
 * Generates the review, or returns the stored one when it exists.
 *
 * `refresh` is the only path that spends a second AI call on the same file, so
 * it is always an explicit user action rather than something the page does on
 * its own.
 */
export async function generateReview(
  resumeFileId: string,
  refresh = false,
): Promise<GeneratedReview> {
  const response = await authedFetch(
    `/api/resumes/${resumeFileId}/review${refresh ? '?refresh=true' : ''}`,
    { method: 'POST' },
  );
  return (await response.json()) as GeneratedReview;
}
