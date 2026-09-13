import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, FileDown, FileText, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResumeDocument, type TemplateStyle } from '@/features/templates/ResumeDocument';
import type { ResumeData } from '@/features/editor/api/editorApi';
import {
  downloadDocx,
  getExportAudit,
  type ExportAudit,
  type ExportIssue,
} from '@/features/export/api/exportApi';

function IssueList({ issues, tone }: { issues: ExportIssue[]; tone: 'blocking' | 'warning' }) {
  const Icon = tone === 'blocking' ? XCircle : AlertTriangle;

  return (
    <ul className="space-y-1.5">
      {issues.map((issue, index) => (
        <li key={`${issue.id}-${index}`} className="flex items-start gap-2 text-sm">
          <Icon
            className={tone === 'blocking' ? 'mt-0.5 size-4 shrink-0 text-destructive' : 'mt-0.5 size-4 shrink-0 text-warning'}
            aria-hidden="true"
          />
          <span>
            {issue.where ? <span className="font-medium">{issue.where}: </span> : null}
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The final check and the two ways out: Word and PDF.
 *
 * Both downloads are refused while anything blocks — the same audit the server
 * enforces, shown here first so the user fixes the problem rather than meeting
 * it as an error. Warnings are shown and do not stop anything: the user may
 * well stand behind an AI-written line, and saying so is their call.
 *
 * PDF goes through the browser's print-to-PDF, which produces selectable text
 * from the exact component the preview renders. A separate PDF renderer would
 * be one more thing that could lay the resume out differently from the page the
 * user approved.
 */
export function ExportPanel({
  resumeId,
  versionId,
  templateId,
  templateStyle,
  resume,
}: {
  resumeId: string;
  versionId: string;
  templateId: string;
  templateStyle: TemplateStyle;
  resume: ResumeData;
}) {
  const [audit, setAudit] = useState<ExportAudit | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAudit(null);
    setAuditError(null);
    setNote(null);

    getExportAudit(resumeId, versionId, templateId)
      .then((result) => {
        if (!cancelled) setAudit(result.audit);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAuditError(error instanceof Error ? error.message : 'The final check could not run.');
        }
      });

    return () => {
      cancelled = true;
    };
    // The resume content is part of the key: an edit in another tab should not
    // leave a stale "ready" standing.
  }, [resumeId, versionId, templateId, resume]);

  async function handleDocx() {
    setDownloading(true);
    setNote(null);
    try {
      const fileName = await downloadDocx(resumeId, versionId, templateId);
      setNote(`Downloaded ${fileName}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'The Word document could not be created.');
    } finally {
      setDownloading(false);
    }
  }

  const ready = audit?.ready ?? false;

  return (
    <>
      <Card data-testid="export-panel">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="size-4" aria-hidden="true" />
            Export
          </CardTitle>
          <CardDescription>A final check runs first. You get exactly what the preview shows.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {!audit && !auditError ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Checking the resume…
            </p>
          ) : null}

          {auditError ? (
            <p role="alert" className="text-sm text-destructive">
              {auditError}
            </p>
          ) : null}

          {audit && audit.blocking.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">Fix before exporting</p>
              <IssueList issues={audit.blocking} tone="blocking" />
            </div>
          ) : null}

          {audit && audit.warnings.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="text-sm font-medium">Worth a second look</p>
              <IssueList issues={audit.warnings} tone="warning" />
            </div>
          ) : null}

          {audit && ready && audit.warnings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Ready to export.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={!ready || downloading} onClick={() => void handleDocx()}>
              <FileText />
              {downloading ? 'Creating…' : 'Download Word'}
            </Button>
            <Button variant="outline" disabled={!ready} onClick={() => window.print()}>
              <FileDown />
              Save as PDF
            </Button>
          </div>

          {ready ? (
            <p className="text-xs text-muted-foreground">
              For PDF, choose <span className="font-medium">Save as PDF</span> as the printer. The
              text stays selectable, so filters can read it.
            </p>
          ) : null}

          {note ? (
            <p className="text-sm" aria-live="polite">
              {note}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/*
        Rendered into <body> and hidden on screen. Print styles remove every
        other element, so the saved PDF is this and only this — the same
        component the preview shows, in print mode so AI markers are absent.
      */}
      {createPortal(
        <div id="print-root">
          <ResumeDocument resume={resume} style={templateStyle} mode="print" />
        </div>,
        document.body,
      )}
    </>
  );
}
