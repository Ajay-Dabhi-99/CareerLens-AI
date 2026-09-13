import type { SupabaseClient } from '@supabase/supabase-js';
import type { SkillMatch } from '@career-lens-ai/types';

export interface JobMatchRecord {
  id: string;
  userId: string;
  resumeVersionId: string;
  jobAnalysisId: string;
  matchScore: number;
  matches: SkillMatch[];
  model: string | null;
  createdAt: string;
}

interface MatchRow {
  id: string;
  user_id: string;
  resume_version_id: string;
  job_analysis_id: string;
  match_score: number;
  matches: SkillMatch[];
  model: string | null;
  created_at: string;
}

function toRecord(row: MatchRow): JobMatchRecord {
  return {
    id: row.id,
    userId: row.user_id,
    resumeVersionId: row.resume_version_id,
    jobAnalysisId: row.job_analysis_id,
    matchScore: row.match_score,
    matches: row.matches,
    model: row.model,
    createdAt: row.created_at,
  };
}

export interface SaveMatchInput {
  userId: string;
  resumeVersionId: string;
  jobAnalysisId: string;
  matchScore: number;
  matches: SkillMatch[];
  model: string;
}

export interface JobMatchRepository {
  findForPair(
    resumeVersionId: string,
    jobAnalysisId: string,
    userId: string,
  ): Promise<JobMatchRecord | null>;
  save(input: SaveMatchInput): Promise<JobMatchRecord>;
}

/**
 * Stored match results, one per resume version and job analysis.
 *
 * Keyed on the version rather than the resume: a match describes a specific
 * draft, and once the user edits it the old verdicts are about text that no
 * longer exists.
 */
export function createJobMatchRepository(client: SupabaseClient): JobMatchRepository {
  return {
    async findForPair(resumeVersionId, jobAnalysisId, userId) {
      const { data, error } = await client
        .from('job_matches')
        .select()
        .eq('resume_version_id', resumeVersionId)
        .eq('job_analysis_id', jobAnalysisId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw new Error(`Could not read the job match: ${error.message}`);

      return data ? toRecord(data as MatchRow) : null;
    },

    async save(input) {
      const { data, error } = await client
        .from('job_matches')
        .upsert(
          {
            user_id: input.userId,
            resume_version_id: input.resumeVersionId,
            job_analysis_id: input.jobAnalysisId,
            match_score: input.matchScore,
            matches: input.matches,
            model: input.model,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'resume_version_id,job_analysis_id' },
        )
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not save the job match: ${error?.message ?? 'no row'}`);
      }

      return toRecord(data as MatchRow);
    },
  };
}
