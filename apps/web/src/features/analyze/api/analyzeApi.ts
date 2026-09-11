import { uploadFile } from '@/lib/upload';

const SESSION_STORAGE_KEY = 'careerlens.quickAnalysis';

export interface QuickAnalysisResult {
  sessionToken: string;
  expiresAt: string;
  file: { name: string; type: 'pdf' | 'docx' | 'txt'; size: number };
  analysis: unknown | null;
  status: 'awaiting-analysis' | 'analyzed';
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
