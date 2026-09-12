import { uploadFile } from '@/lib/upload';

const SESSION_STORAGE_KEY = 'careerlens.quickAnalysis';

/** Mirrors the subset of ResumeData the public result actually shows. */
export interface ParsedResumePreview {
  personal: { fullName: string; email?: string; phone?: string; location?: string };
  summary: string;
  skills: Array<{ id: string; category: string; skills: string[] }>;
  experience: Array<{ id: string; title: string; company: string; bullets: unknown[] }>;
  education: Array<{ id: string; institution: string; degree?: string }>;
  projects: unknown[];
  certifications: unknown[];
  metadata: { wordCount?: number };
}

export interface AtsFinding {
  id: string;
  severity: 'good' | 'warning' | 'critical';
  message: string;
}

export interface PublicScore {
  finalScore: number;
  categories: Array<{ category: string; label: string; score: number; weight: number }>;
  findings: AtsFinding[];
  totalFindings: number;
  withheldFindings: number;
}

export interface QuickAnalysisResult {
  sessionToken: string;
  expiresAt: string;
  file: { name: string; type: 'pdf' | 'docx' | 'txt'; size: number };
  resume: ParsedResumePreview;
  detectedSections: string[];
  score: PublicScore;
  status: 'awaiting-analysis' | 'scored';
}

export function uploadForQuickAnalysis(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<QuickAnalysisResult> {
  return uploadFile<QuickAnalysisResult>({
    path: '/api/public/analyze',
    file,
    onProgress,
  });
}

/**
 * Keeps the token for this tab only, so it can be imported after logging in.
 * sessionStorage (not localStorage) because the analysis is temporary by design.
 */
export function rememberQuickAnalysis(result: QuickAnalysisResult): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(result));
  } catch {
    // Private browsing or blocked storage — the flow still works, just not across reloads.
  }
}

export function recallQuickAnalysis(): QuickAnalysisResult | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuickAnalysisResult;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function forgetQuickAnalysis(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
