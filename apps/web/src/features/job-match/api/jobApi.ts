import { authedFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/supabase';
import { uploadFile } from '@/lib/upload';

export type JobSource = 'paste' | 'upload';

export interface JobDescription {
  id: string;
  userId: string;
  rawText: string;
  title?: string;
  company?: string;
  source: JobSource;
  fileName?: string;
  createdAt: string;
}

export type RequirementCategory = 'skill' | 'responsibility' | 'qualification' | 'keyword';

export interface JobRequirement {
  id: string;
  text: string;
  category: RequirementCategory;
  required: boolean;
}

export interface JobAnalysis {
  id: string;
  jobDescriptionId: string;
  requirements: JobRequirement[];
  keywords: string[];
  model: string;
  createdAt: string;
}

export async function listJobs(): Promise<JobDescription[]> {
  const response = await authedFetch('/api/jobs');
  const body = (await response.json()) as { jobs: JobDescription[] };
  return body.jobs;
}

export async function getJob(
  id: string,
): Promise<{ job: JobDescription; analysis: JobAnalysis | null }> {
  const response = await authedFetch(`/api/jobs/${id}`);
  return (await response.json()) as { job: JobDescription; analysis: JobAnalysis | null };
}

export async function pasteJob(input: {
  rawText: string;
  title?: string;
  company?: string;
}): Promise<JobDescription> {
  const response = await authedFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { job: JobDescription };
  return body.job;
}

export async function uploadJob(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<JobDescription> {
  const accessToken = await getAccessToken();
  const body = await uploadFile<{ job: JobDescription }>({
    path: '/api/jobs/upload',
    file,
    accessToken,
    onProgress,
  });
  return body.job;
}

/** Costs one AI call the first time, and nothing on every call after that. */
export async function analyzeJob(
  id: string,
): Promise<{ analysis: JobAnalysis; cached: boolean }> {
  const response = await authedFetch(`/api/jobs/${id}/analyze`, { method: 'POST' });
  return (await response.json()) as { analysis: JobAnalysis; cached: boolean };
}

export async function deleteJob(id: string): Promise<void> {
  await authedFetch(`/api/jobs/${id}`, { method: 'DELETE' });
}
