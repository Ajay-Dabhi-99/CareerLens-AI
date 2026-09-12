import { useCallback, useEffect, useState } from 'react';
import { FileText, Sparkles, Trash2, Upload } from 'lucide-react';
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
import { generateReview, getReview, type StoredReview } from '@/features/resume/api/reviewApi';
import { AiReview } from '@/features/resume/components/AiReview';
import { ScorePanel } from '@/features/resume/components/ScorePanel';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; files: ResumeFile[] };

/** The resume currently on screen. The score is only known just after an upload. */
interface ActiveResume {
  fileId: string;
  fileName: string;
  score: FullScore | null;
}

type ReviewState =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'generating' }
  | { kind: 'ready'; review: StoredReview }
  | { kind: 'error'; message: string };

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
  const [active, setActive] = useState<ActiveResume | null>(null);
  const [review, setReview] = useState<ReviewState>({ kind: 'none' });

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

  /**
   * Looks for a review that already exists. This never generates one, so
   * opening a resume costs nothing.
   */
  const lookUpReview = useCallback(async (fileId: string) => {
    setReview({ kind: 'checking' });
    try {
      const existing = await getReview(fileId);
      setReview(existing ? { kind: 'ready', review: existing } : { kind: 'none' });
    } catch {
      // A missing review is not an error worth showing; the user can still ask
      // for one, which reports its own failure properly.
      setReview({ kind: 'none' });
    }
  }, []);

  const runReview = useCallback(
    async (fileId: string, refresh = false) => {
      setReview({ kind: 'generating' });
      try {
        const result = await generateReview(fileId, refresh);
        setReview({ kind: 'ready', review: result.review });
        // A freshly generated review carries the score it was based on.
        if (result.score) {
          setActive((current) =>
            current && current.fileId === fileId ? { ...current, score: result.score! } : current,
          );
        }
      } catch (error) {
        setReview({
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'The AI review could not be generated.',
        });
      }
    },
    [],
  );

  const upload = useCallback(
    async (file: File) => {
      setUploadError(null);
      setProgress(0);
      try {
        const result = await uploadResumeFile(file, setProgress);
        setPending(null);
        setProgress(null);
        setActive({
          fileId: result.resumeFile.id,
          fileName: result.resumeFile.fileName,
          score: result.score,
        });
        // A fresh upload has no review yet, but check rather than assume: the
        // same file re-uploaded under a new id is cheap to confirm.
        void lookUpReview(result.resumeFile.id);
        load();
      } catch (error) {
        setProgress(null);
        setUploadError(error instanceof Error ? error.message : 'Upload failed.');
      }
    },
    [load, lookUpReview],
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

  function openResume(file: ResumeFile) {
    setActive({ fileId: file.id, fileName: file.fileName, score: null });
    void lookUpReview(file.id);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteResumeFile(id);
      if (active?.fileId === id) {
        setActive(null);
        setReview({ kind: 'none' });
      }
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

      {active ? (
        <section className="space-y-4" aria-label={`Analysis of ${active.fileName}`}>
          {review.kind === 'none' || review.kind === 'error' ? (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" aria-hidden="true" />
                  AI review
                </CardTitle>
                <CardDescription>
                  A reviewer reads {active.fileName} and tells you what to change first, grounded
                  in what the document actually says.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {review.kind === 'error' ? (
                  <ErrorState title="Review failed" description={review.message} />
                ) : null}
                <Button onClick={() => void runReview(active.fileId)}>
                  <Sparkles />
                  {review.kind === 'error' ? 'Try again' : 'Run AI review'}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {review.kind === 'checking' ? <LoadingState rows={2} /> : null}

          {review.kind === 'generating' ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-6" aria-live="polite">
                <Sparkles className="size-5 animate-pulse text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Reading your resume…</p>
                  <p className="text-xs text-muted-foreground">
                    This takes a few seconds. The result is saved, so you only wait once.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {review.kind === 'ready' ? (
            <AiReview
              analysis={review.review.analysis}
              createdAt={review.review.createdAt}
              onRefresh={() => void runReview(active.fileId, true)}
            />
          ) : null}

          {active.score ? <ScorePanel score={active.score} /> : null}
        </section>
      ) : null}

      {list.kind === 'loading' ? <LoadingState rows={3} /> : null}

      {list.kind === 'error' ? <ErrorState description={list.message} onRetry={load} /> : null}

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
                variant="outline"
                size="sm"
                onClick={() => openResume(file)}
                disabled={active?.fileId === file.id}
              >
                {active?.fileId === file.id ? 'Open' : 'Review'}
              </Button>
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
