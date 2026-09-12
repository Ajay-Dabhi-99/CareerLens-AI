import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResumeAnalysis } from '@career-lens-ai/types';

export interface ResumeReviewRecord {
  id: string;
  resumeFileId: string;
  userId: string;
  analysis: ResumeAnalysis;
  model: string;
  createdAt: string;
}

interface ResumeReviewRow {
  id: string;
  resume_file_id: string;
  user_id: string;
  analysis: ResumeAnalysis;
  model: string;
  created_at: string;
}

function toRecord(row: ResumeReviewRow): ResumeReviewRecord {
  return {
    id: row.id,
    resumeFileId: row.resume_file_id,
    userId: row.user_id,
    analysis: row.analysis,
    model: row.model,
    createdAt: row.created_at,
  };
}

export interface SaveReviewInput {
  resumeFileId: string;
  userId: string;
  analysis: ResumeAnalysis;
  model: string;
}

export interface ResumeReviewRepository {
  findForFile(resumeFileId: string, userId: string): Promise<ResumeReviewRecord | null>;
  save(input: SaveReviewInput): Promise<ResumeReviewRecord>;
}

/**
 * Stored reviews, one per resume file.
 *
 * As with the other repositories, every method takes the caller's userId and
 * filters on it: the API holds the service role key, which bypasses row-level
 * security, so these filters are the real ownership boundary and the RLS
 * policies are defence in depth behind them.
 */
export function createResumeReviewRepository(client: SupabaseClient): ResumeReviewRepository {
  return {
    async findForFile(resumeFileId, userId) {
      const { data, error } = await client
        .from('resume_reviews')
        .select()
        .eq('resume_file_id', resumeFileId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return null;
      return toRecord(data as ResumeReviewRow);
    },

    async save(input) {
      // Upsert on the file: a refresh replaces the current review rather than
      // leaving two rows that disagree about the same document.
      const { data, error } = await client
        .from('resume_reviews')
        .upsert(
          {
            resume_file_id: input.resumeFileId,
            user_id: input.userId,
            analysis: input.analysis,
            model: input.model,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'resume_file_id' },
        )
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not save the review: ${error?.message ?? 'no row'}`);
      }

      return toRecord(data as ResumeReviewRow);
    },
  };
}
