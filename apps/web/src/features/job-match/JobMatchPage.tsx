import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPaste, FileText, Sparkles, Target, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ErrorState';
import { FileDropzone } from '@/components/FileDropzone';
import { LoadingState } from '@/components/LoadingState';
import { preCheckFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import {
  analyzeJob,
  deleteJob,
  getJob,
  listJobs,
  pasteJob,
  uploadJob,
  type JobAnalysis,
  type JobDescription,
} from '@/features/job-match/api/jobApi';
import { RequirementList } from '@/features/job-match/components/RequirementList';

type Mode = 'paste' | 'upload';

export function JobMatchPage() {
  const [jobs, setJobs] = useState<JobDescription[] | null>(null);
  const [selected, setSelected] = useState<JobDescription | null>(null);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [mode, setMode] = useState<Mode>('paste');
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    listJobs()
      .then((list) => {
        setJobs(list);
        // Nothing is auto-selected: arriving here should not commit the user to
        // a posting they added days ago.
        setAdding(list.length === 0);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load your job descriptions.');
        /*
         * Empty rather than null, so the page renders with the error on it.
         * Leaving it null showed a loading skeleton that never resolved — the
         * one state where the user is told nothing at all.
         */
        setJobs([]);
        setAdding(true);
      });
  }, []);

  useEffect(load, [load]);

  const open = useCallback(async (job: JobDescription) => {
    setSelected(job);
    setAnalysis(null);
    setError(null);

    try {
      const result = await getJob(job.id);
      setAnalysis(result.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that job description.');
    }
  }, []);

  async function handlePaste() {
    setBusy(true);
    setError(null);

    try {
      const job = await pasteJob({
        rawText,
        title: title.trim() || undefined,
        company: company.trim() || undefined,
      });
      setRawText('');
      setTitle('');
      setCompany('');
      setAdding(false);
      load();
      void open(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That job description could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File) {
    const problem = preCheckFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const job = await uploadJob(file);
      setAdding(false);
      load();
      void open(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyze(job: JobDescription) {
    setAnalyzing(true);
    setError(null);

    try {
      const result = await analyzeJob(job.id);
      setAnalysis(result.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The requirements could not be extracted.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDelete(job: JobDescription) {
    try {
      await deleteJob(job.id);
      if (selected?.id === job.id) {
        setSelected(null);
        setAnalysis(null);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That job description could not be deleted.');
    }
  }

  if (!jobs) return <LoadingState rows={4} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Job match</h2>
        <p className="text-sm text-muted-foreground">
          Add the job you are applying for and we will read out what it asks for. Entirely
          optional — your resume score, review, editor and export all work without one.
        </p>
      </div>

      {error ? <ErrorState title="Something went wrong" description={error} /> : null}

      {adding ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Add a job description</CardTitle>
                <CardDescription>Paste the text, or upload the posting as a file.</CardDescription>
              </div>

              {/*
                The skip is a real way out, not a disabled-looking link. The spec
                requires it to be available at every point, and a user who is
                only here to fix their resume should be able to leave in one
                click without having added anything.
              */}
              <Button asChild variant="ghost" size="sm">
                <Link to="/resumes">Skip this — just improve my resume</Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {(['paste', 'upload'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                    mode === option ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {option === 'paste' ? <ClipboardPaste className="size-4" /> : <Upload className="size-4" />}
                  {option === 'paste' ? 'Paste text' : 'Upload a file'}
                </button>
              ))}
            </div>

            {mode === 'paste' ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="job-title">Job title (optional)</Label>
                    <Input
                      id="job-title"
                      value={title}
                      placeholder="Senior Backend Engineer"
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="job-company">Company (optional)</Label>
                    <Input
                      id="job-company"
                      value={company}
                      placeholder="Monzo"
                      onChange={(event) => setCompany(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="job-text">Job description</Label>
                  <textarea
                    id="job-text"
                    value={rawText}
                    rows={10}
                    placeholder="Paste the whole posting here, including the responsibilities and requirements."
                    onChange={(event) => setRawText(event.target.value)}
                    className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    {rawText.trim().length < 50
                      ? 'Paste at least a few lines — a fragment is not enough to read requirements from.'
                      : `${rawText.trim().length.toLocaleString()} characters`}
                  </p>
                </div>

                <Button disabled={busy || rawText.trim().length < 50} onClick={() => void handlePaste()}>
                  {busy ? 'Saving…' : 'Save job description'}
                </Button>
              </div>
            ) : (
              <FileDropzone onFileSelected={(file) => void handleUpload(file)} disabled={busy} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {jobs.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Your job descriptions</CardTitle>
              {adding ? null : (
                <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                  Add another
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <ul className="space-y-2" data-testid="job-list">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-xl border p-3',
                    selected?.id === job.id ? 'border-primary bg-primary/5' : 'border-border bg-card',
                  )}
                >
                  <div className="rounded-lg bg-primary/10 p-2">
                    {job.source === 'upload' ? (
                      <FileText className="size-4 text-primary" aria-hidden="true" />
                    ) : (
                      <Target className="size-4 text-primary" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {job.title || job.fileName || 'Untitled posting'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[job.company, new Date(job.createdAt).toLocaleDateString()]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <Button size="sm" variant="outline" onClick={() => void open(job)}>
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${job.title || 'this job description'}`}
                    onClick={() => void handleDelete(job)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {selected && !analysis ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              Read out the requirements
            </CardTitle>
            <CardDescription>
              Pulls the skills, responsibilities and keywords out of this posting. Done once and
              kept, so opening it again is free.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={analyzing} onClick={() => void handleAnalyze(selected)}>
              <Sparkles />
              {analyzing ? 'Reading the posting…' : 'Extract requirements'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {analysis ? <RequirementList analysis={analysis} /> : null}
    </div>
  );
}
