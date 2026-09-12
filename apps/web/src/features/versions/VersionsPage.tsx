import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, History, PenLine, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { scoreTone } from '@/components/ScoreRing';
import { cn } from '@/lib/utils';
import {
  deleteVersion,
  getVersion,
  listEditorResumes,
  listVersions,
  restoreVersion,
  type ResumeData,
  type ResumeRecord,
  type VersionSummary,
} from '@/features/editor/api/editorApi';
import { VersionCompare } from '@/features/versions/components/VersionCompare';

const LABEL_TEXT: Record<VersionSummary['label'], string> = {
  draft: 'Working copy',
  original: 'Original upload',
  snapshot: 'Saved version',
  'ai-improved': 'AI improved',
  'job-tailored': 'Job tailored',
};

/** Only these two are permanent; the rest the user created and can remove. */
function isProtected(label: VersionSummary['label']): boolean {
  return label === 'original' || label === 'draft';
}

interface Loaded {
  data: ResumeData;
  score: number;
  name: string;
}

export function VersionsPage() {
  const [resumes, setResumes] = useState<ResumeRecord[] | null>(null);
  const [selected, setSelected] = useState<ResumeRecord | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [compareLeft, setCompareLeft] = useState<Loaded | null>(null);
  const [compareRight, setCompareRight] = useState<Loaded | null>(null);

  useEffect(() => {
    listEditorResumes()
      .then((list) => {
        setResumes(list);
        setSelected(list[0] ?? null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load your resumes.'),
      );
  }, []);

  const loadVersions = useCallback((resumeId: string) => {
    listVersions(resumeId)
      .then(setVersions)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load the version history.'),
      );
  }, []);

  useEffect(() => {
    if (selected) loadVersions(selected.id);
  }, [selected, loadVersions]);

  async function pickForCompare(version: VersionSummary) {
    if (!selected) return;

    try {
      const { version: full, score } = await getVersion(selected.id, version.id);
      const loaded: Loaded = {
        data: full.data,
        score: score.finalScore,
        name: version.name || LABEL_TEXT[version.label],
      };

      // First click sets the left side, second the right, third starts over.
      if (!compareLeft || (compareLeft && compareRight)) {
        setCompareLeft(loaded);
        setCompareRight(null);
      } else {
        setCompareRight(loaded);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that version.');
    }
  }

  async function handleRestore(version: VersionSummary) {
    if (!selected) return;
    setBusyId(version.id);
    setError(null);

    try {
      const result = await restoreVersion(selected.id, version.id);
      // Saying where the previous work went is the point: the user should not
      // have to trust that it was kept, they should be told its name.
      setNotice(
        `Restored "${version.name || LABEL_TEXT[version.label]}". What you had before was kept as "${result.keptAs.name}".`,
      );
      loadVersions(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That version could not be restored.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(version: VersionSummary) {
    if (!selected) return;
    setBusyId(version.id);

    try {
      await deleteVersion(selected.id, version.id);
      loadVersions(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That version could not be deleted.');
    } finally {
      setBusyId(null);
    }
  }

  if (error && !resumes) return <ErrorState description={error} />;
  if (!resumes) return <LoadingState rows={4} />;

  if (resumes.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No version history yet"
        description="Open a resume in the editor and your original upload is kept automatically, so you always have something to go back to."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Versions</h2>
        <p className="text-sm text-muted-foreground">
          Compare any two versions, or make an earlier one your working copy. Your original
          upload is always kept.
        </p>
      </div>

      {resumes.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {resumes.map((resume) => (
            <Button
              key={resume.id}
              size="sm"
              variant={selected?.id === resume.id ? 'default' : 'outline'}
              onClick={() => {
                setSelected(resume);
                setCompareLeft(null);
                setCompareRight(null);
              }}
            >
              <FileText />
              {resume.title}
            </Button>
          ))}
        </div>
      ) : null}

      {notice ? (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{selected?.title}</CardTitle>
              <CardDescription>
                {compareLeft && !compareRight
                  ? `Comparing from "${compareLeft.name}" — pick a second version.`
                  : 'Select two versions to compare them.'}
              </CardDescription>
            </div>
            {selected ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/editor/${selected.id}`}>
                  <PenLine />
                  Open editor
                </Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          <ul className="space-y-2" data-testid="version-list">
            {versions.map((version) => {
              const tone = scoreTone(version.score);
              const isLeft = compareLeft?.name === (version.name || LABEL_TEXT[version.label]);

              return (
                <li
                  key={version.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-xl border p-3',
                    isLeft ? 'border-primary bg-primary/5' : 'border-border bg-card',
                  )}
                >
                  <span className={cn('text-lg font-semibold tabular-nums', tone.text)}>
                    {version.score}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {version.name || LABEL_TEXT[version.label]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {LABEL_TEXT[version.label]} · {new Date(version.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <Button size="sm" variant="ghost" onClick={() => void pickForCompare(version)}>
                    Compare
                  </Button>

                  {version.label === 'draft' ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === version.id}
                      onClick={() => void handleRestore(version)}
                    >
                      <RotateCcw />
                      {busyId === version.id ? 'Restoring…' : 'Restore'}
                    </Button>
                  )}

                  {isProtected(version.label) ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${version.name}`}
                      disabled={busyId === version.id}
                      onClick={() => void handleDelete(version)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {compareLeft && compareRight ? (
        <VersionCompare
          leftName={compareLeft.name}
          rightName={compareRight.name}
          leftScore={compareLeft.score}
          rightScore={compareRight.score}
          left={compareLeft.data}
          right={compareRight.data}
        />
      ) : null}
    </div>
  );
}
