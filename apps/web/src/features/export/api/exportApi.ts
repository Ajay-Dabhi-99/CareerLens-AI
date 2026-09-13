import { authedFetch } from '@/lib/api';

export interface ExportIssue {
  id: string;
  message: string;
  where?: string;
}

export interface ExportAudit {
  blocking: ExportIssue[];
  warnings: ExportIssue[];
  ready: boolean;
}

export interface AuditResult {
  audit: ExportAudit;
  templateId: string;
  version: { id: string; label: string; name: string; updatedAt: string };
}

function query(versionId: string, template: string): string {
  return `versionId=${encodeURIComponent(versionId)}&template=${encodeURIComponent(template)}`;
}

/** Free and deterministic, so the panel can re-run it whenever the selection changes. */
export async function getExportAudit(
  resumeId: string,
  versionId: string,
  template: string,
): Promise<AuditResult> {
  const response = await authedFetch(
    `/api/editor/resumes/${resumeId}/export/audit?${query(versionId, template)}`,
  );
  return (await response.json()) as AuditResult;
}

/**
 * Downloads the Word document for a version and template.
 *
 * Built on the server from the stored version, so what downloads is what was
 * saved. The name comes from the server's Content-Disposition so the file is
 * called after the person and the template.
 */
export async function downloadDocx(
  resumeId: string,
  versionId: string,
  template: string,
): Promise<string> {
  const response = await authedFetch(
    `/api/editor/resumes/${resumeId}/export/docx?${query(versionId, template)}`,
  );

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'Resume.docx';

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Released after the click has handed the blob to the browser's downloader.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return fileName;
}
