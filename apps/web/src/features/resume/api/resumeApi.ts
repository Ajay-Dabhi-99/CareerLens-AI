import { authedFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/supabase';
import { uploadFile } from '@/lib/upload';

export interface ResumeFile {
  id: string;
  userId: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt';
  fileSize: number;
  storagePath: string;
  createdAt: string;
}

export async function listResumeFiles(): Promise<ResumeFile[]> {
  const response = await authedFetch('/api/resumes');
  const body = (await response.json()) as { resumeFiles: ResumeFile[] };
  return body.resumeFiles;
}

export interface AtsFinding {
  id: string;
  severity: 'good' | 'warning' | 'critical';
  message: string;
}

/** Signed-in users receive every finding, unlike the gated anonymous summary. */
export interface FullScore {
  finalScore: number;
  categories: Array<{
    category: string;
    weight: number;
    score: number;
    findings: AtsFinding[];
  }>;
}

export interface UploadResult {
  resumeFile: ResumeFile;
  score: FullScore;
}

export async function uploadResumeFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const accessToken = await getAccessToken();
  return uploadFile<UploadResult>({
    path: '/api/resumes',
    file,
    accessToken,
    onProgress,
  });
}

export async function deleteResumeFile(id: string): Promise<void> {
  await authedFetch(`/api/resumes/${id}`, { method: 'DELETE' });
}

export async function importQuickAnalysis(sessionToken: string): Promise<void> {
  await authedFetch('/api/resumes/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken }),
  });
}
