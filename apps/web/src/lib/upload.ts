import { ApiError } from '@/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const;

export interface UploadOptions {
  path: string;
  file: File;
  accessToken?: string | null;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads via XMLHttpRequest rather than fetch, because fetch still cannot report
 * upload progress. The server re-validates everything regardless of what we send.
 */
export function uploadFile<T>({
  path,
  file,
  accessToken,
  onProgress,
  signal,
}: UploadOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file);

    request.open('POST', `${API_BASE_URL}${path}`);
    if (accessToken) {
      request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    }

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(request.responseText) as unknown;
      } catch {
        parsed = null;
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(parsed as T);
        return;
      }

      const message =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : 'Upload failed. Please try again.';
      reject(new ApiError(message, request.status));
    });

    request.addEventListener('error', () =>
      reject(new ApiError('Could not reach the server.', 0)),
    );
    request.addEventListener('abort', () => reject(new ApiError('Upload cancelled.', 0)));

    signal?.addEventListener('abort', () => request.abort());

    request.send(body);
  });
}

/** Client-side pre-check for fast feedback. The server validates the bytes for real. */
export function preCheckFile(file: File): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  }

  const name = file.name.toLowerCase();
  const allowed = ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
  if (!allowed) return 'Please choose a PDF, DOCX or TXT file.';

  return null;
}
