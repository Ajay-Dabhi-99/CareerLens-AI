import { useCallback, useState } from 'react';
import { CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileDropzone } from '@/components/FileDropzone';
import { ErrorState } from '@/components/ErrorState';
import { ParsedResumeSummary } from '@/features/analyze/components/ParsedResumeSummary';
import { preCheckFile } from '@/lib/upload';
import {
  rememberQuickAnalysis,
  uploadForQuickAnalysis,
  type QuickAnalysisResult,
} from '@/features/analyze/api/analyzeApi';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: QuickAnalysisResult };

export interface QuickAnalysisUploaderProps {
  onComplete?: (result: QuickAnalysisResult) => void;
}

export function QuickAnalysisUploader({ onComplete }: QuickAnalysisUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const upload = useCallback(
    async (target: File) => {
      setPhase({ kind: 'uploading', percent: 0 });
      try {
        const result = await uploadForQuickAnalysis(target, (percent) =>
          setPhase({ kind: 'uploading', percent }),
        );
        rememberQuickAnalysis(result);
        setPhase({ kind: 'done', result });
        onComplete?.(result);
      } catch (error) {
        setPhase({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Upload failed. Please try again.',
        });
      }
    },
    [onComplete],
  );

  const handleSelected = useCallback(
    (selected: File) => {
      const problem = preCheckFile(selected);
      if (problem) {
        setFile(null);
        setPhase({ kind: 'error', message: problem });
        return;
      }
      setFile(selected);
      void upload(selected);
    },
    [upload],
  );

  const reset = useCallback(() => {
    setFile(null);
    setPhase({ kind: 'idle' });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload your CV</CardTitle>
        <CardDescription>
          PDF, DOCX or TXT. Nothing is stored to an account, and the result clears itself.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {phase.kind === 'error' ? (
          <ErrorState
            title="That didn't work"
            description={phase.message}
            onRetry={file ? () => void upload(file) : undefined}
          />
        ) : null}

        {phase.kind === 'done' ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium">{phase.result.file.name} read successfully</p>
                <p className="text-sm text-muted-foreground">
                  Your CV was parsed into structured sections. Scoring arrives in the next phase.
                </p>
                <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  <Clock className="size-3" aria-hidden="true" />
                  Clears automatically at{' '}
                  {new Date(phase.result.expiresAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            <ParsedResumeSummary
              resume={phase.result.resume}
              detectedSections={phase.result.detectedSections}
            />

            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw />
              Upload a different file
            </Button>
          </div>
        ) : (
          <>
            <FileDropzone
              onFileSelected={handleSelected}
              selectedFile={file}
              onClear={reset}
              disabled={phase.kind === 'uploading'}
            />

            {phase.kind === 'uploading' ? (
              <div className="space-y-2" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Uploading…</span>
                  <span className="tabular-nums">{phase.percent}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={phase.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${phase.percent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
