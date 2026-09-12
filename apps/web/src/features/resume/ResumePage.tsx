import { useCallback, useEffect, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileDropzone } from '@/components/FileDropzone';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { preCheckFile } from '@/lib/upload';
import {
  deleteResumeFile,
  listResumeFiles,
  uploadResumeFile,
  type FullScore,
  type ResumeFile,
} from '@/features/resume/api/resumeApi';
import { FullScoreResult } from '@/features/resume/components/FullScoreResult';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; files: ResumeFile[] };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumePage() {
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [pending, setPending] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [score, setScore] = useState<FullScore | null>(null);

  const load = useCallback(() => {
    setList({ kind: 'loading' });
    listResumeFiles()
      .then((files) => setList({ kind: 'loaded', files }))
      .catch((error: unknown) =>
        setList({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not load your resumes.',
        }),
      );
  }, []);

  useEffect(load, [load]);

  const upload = useCallback(
    async (file: File) => {
      setUploadError(null);
      setProgress(0);
      try {
        const result = await uploadResumeFile(file, setProgress);
        setPending(null);
        setProgress(null);
        // The server scores every authenticated upload; showing it is the whole
        // point of being signed in.
        setScore(result.score);
        load();
      } catch (error) {
        setProgress(null);
        setUploadError(error instanceof Error ? error.message : 'Upload failed.');
      }
    },
    [load],
  );

  const handleSelected = useCallback(
    (file: File) => {
      const problem = preCheckFile(file);
      if (problem) {
        setPending(null);
        setUploadError(problem);
        return;
      }
      setPending(file);
      void upload(file);
    },
    [upload],
  );

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteResumeFile(id);
      load();
    } catch (error) {
      setList({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not delete that file.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Your resumes</h2>
        <p className="text-sm text-muted-foreground">
          Uploaded files are stored privately against your account. The original is always kept
          separate from anything you edit later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a resume</CardTitle>
          <CardDescription>PDF, DOCX or TXT, up to 5 MB.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {uploadError ? (
            <ErrorState
              title="Upload failed"
              description={uploadError}
              onRetry={pending ? () => void upload(pending) : undefined}
            />
          ) : null}

          <FileDropzone
            onFileSelected={handleSelected}
            selectedFile={pending}
            onClear={() => {
              setPending(null);
              setUploadError(null);
            }}
            disabled={progress !== null}
          />

          {progress !== null ? (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Uploading…</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {score ? <FullScoreResult score={score} /> : null}

      {list.kind === 'loading' ? <LoadingState rows={3} /> : null}

      {list.kind === 'error' ? (
        <ErrorState description={list.message} onRetry={load} />
      ) : null}

      {list.kind === 'loaded' && list.files.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No resumes uploaded yet"
          description="Upload a file above to keep it against your account."
        />
      ) : null}

      {list.kind === 'loaded' && list.files.length > 0 ? (
        <ul className="space-y-2" data-testid="resume-list">
          {list.files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="rounded-lg bg-primary/10 p-2.5">
                <FileText className="size-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${file.fileName}`}
                disabled={deletingId === file.id}
                onClick={() => void handleDelete(file.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
