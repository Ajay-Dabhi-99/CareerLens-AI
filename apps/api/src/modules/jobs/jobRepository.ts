import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobAnalysis, JobDescription, JobRequirement } from '@career-lens-ai/types';

export type JobSource = 'paste' | 'upload';

export interface JobDescriptionRecord extends JobDescription {
  source: JobSource;
  fileName?: string;
}

interface JobRow {
  id: string;
  user_id: string;
  raw_text: string;
  title: string | null;
  company: string | null;
  source: JobSource;
  file_name: string | null;
  created_at: string;
}

interface AnalysisRow {
  id: string;
  job_description_id: string;
  user_id: string;
  requirements: JobRequirement[];
  keywords: string[];
  model: string;
  created_at: string;
}

function toJob(row: JobRow): JobDescriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    rawText: row.raw_text,
    title: row.title ?? undefined,
    company: row.company ?? undefined,
    source: row.source,
    fileName: row.file_name ?? undefined,
    createdAt: row.created_at,
  };
}

function toAnalysis(row: AnalysisRow): JobAnalysis & { model: string } {
  return {
    id: row.id,
    jobDescriptionId: row.job_description_id,
    requirements: row.requirements,
    keywords: row.keywords,
    model: row.model,
    createdAt: row.created_at,
  };
}

export interface CreateJobInput {
  userId: string;
  rawText: string;
  title?: string;
  company?: string;
  source: JobSource;
  fileName?: string;
}

export interface SaveAnalysisInput {
  jobDescriptionId: string;
  userId: string;
  requirements: JobRequirement[];
  keywords: string[];
  model: string;
}

export interface JobRepository {
  create(input: CreateJobInput): Promise<JobDescriptionRecord>;
  listForUser(userId: string): Promise<JobDescriptionRecord[]>;
  findOwned(id: string, userId: string): Promise<JobDescriptionRecord | null>;
  delete(id: string, userId: string): Promise<boolean>;
  findAnalysis(jobId: string, userId: string): Promise<(JobAnalysis & { model: string }) | null>;
  saveAnalysis(input: SaveAnalysisInput): Promise<JobAnalysis & { model: string }>;
}

/**
 * Job descriptions and their extracted requirements.
 *
 * As elsewhere, every method filters on the caller's userId — the API holds the
 * service role key, so these filters are the ownership boundary and RLS is
 * defence behind them — and a query error throws rather than reading as "not
 * found", so a database fault is never reported as missing data.
 */
export function createJobRepository(client: SupabaseClient): JobRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from('job_descriptions')
        .insert({
          user_id: input.userId,
          raw_text: input.rawText,
          title: input.title ?? null,
          company: input.company ?? null,
          source: input.source,
          file_name: input.fileName ?? null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not save the job description: ${error?.message ?? 'no row'}`);
      }

      return toJob(data as JobRow);
    },

    async listForUser(userId) {
      const { data, error } = await client
        .from('job_descriptions')
        .select()
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Could not list job descriptions: ${error.message}`);

      return (data as JobRow[]).map(toJob);
    },

    async findOwned(id, userId) {
      const { data, error } = await client
        .from('job_descriptions')
        .select()
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw new Error(`Could not read the job description: ${error.message}`);

      return data ? toJob(data as JobRow) : null;
    },

    async delete(id, userId) {
      const { data, error } = await client
        .from('job_descriptions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id');

      if (error) throw new Error(`Could not delete the job description: ${error.message}`);

      return (data?.length ?? 0) > 0;
    },

    async findAnalysis(jobId, userId) {
      const { data, error } = await client
        .from('job_analyses')
        .select()
        .eq('job_description_id', jobId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw new Error(`Could not read the job analysis: ${error.message}`);

      return data ? toAnalysis(data as AnalysisRow) : null;
    },

    async saveAnalysis(input) {
      const { data, error } = await client
        .from('job_analyses')
        .upsert(
          {
            job_description_id: input.jobDescriptionId,
            user_id: input.userId,
            requirements: input.requirements,
            keywords: input.keywords,
            model: input.model,
          },
          { onConflict: 'job_description_id' },
        )
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not save the job analysis: ${error?.message ?? 'no row'}`);
      }

      return toAnalysis(data as AnalysisRow);
    },
  };
}
