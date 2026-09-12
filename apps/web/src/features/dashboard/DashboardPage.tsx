import { useCallback, useEffect, useState } from 'react';
import { FileText, Target, TrendingUp, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { ApiIdentityCard } from '@/features/dashboard/components/ApiIdentityCard';
import { listResumeFiles, type ResumeFile } from '@/features/resume/api/resumeApi';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; files: ResumeFile[] };

export function DashboardPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    listResumeFiles()
      .then((files) => setState({ kind: 'loaded', files }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not load your resumes.',
        }),
      );
  }, []);

  useEffect(load, [load]);

  const files = state.kind === 'loaded' ? state.files : [];
  const resumeCount = state.kind === 'loaded' ? String(files.length) : '—';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Welcome back</h2>
        <p className="text-sm text-muted-foreground">
          Upload a resume to get an ATS-style health score and AI-powered suggestions — a Job
          Description is optional.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={FileText}
          label="Resumes"
          value={resumeCount}
          hint={files.length > 0 ? 'Stored against your account' : 'Upload your first resume'}
        />
        <StatCard icon={TrendingUp} label="Avg. resume health" value="—" hint="Scored on upload" />
        <StatCard icon={Target} label="Job matches" value="0" hint="Optional, add a JD anytime" />
      </div>

      <ApiIdentityCard />

      {state.kind === 'loading' ? <LoadingState rows={2} /> : null}

      {state.kind === 'error' ? (
        <ErrorState description={state.message} onRetry={load} />
      ) : null}

      {state.kind === 'loaded' && files.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No resumes yet"
          description="Upload a PDF, DOCX or TXT resume to get your Resume Health score and the full breakdown behind it."
          action={
            <Button asChild>
              <Link to="/resumes">
                <Upload />
                Upload resume
              </Link>
            </Button>
          }
        />
      ) : null}

      {state.kind === 'loaded' && files.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent uploads</h3>
            <Button asChild variant="outline" size="sm">
              <Link to="/resumes">
                <Upload />
                Upload another
              </Link>
            </Button>
          </div>
          <ul className="space-y-2">
            {files.slice(0, 3).map((file) => (
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
                    {new Date(file.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
