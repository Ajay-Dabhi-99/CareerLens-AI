import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { barTone, scoreTone } from '@/components/ScoreRing';
import { cn } from '@/lib/utils';
import type { FullScore } from '@/features/resume/api/resumeApi';
import {
  getEditorResume,
  saveDraft,
  StaleDraftError,
  type EditorSnapshot,
  type ResumeData,
} from '@/features/editor/api/editorApi';
import { useAutosave } from '@/features/editor/hooks/useAutosave';
import { SaveIndicator } from '@/features/editor/components/SaveIndicator';
import { Field } from '@/features/editor/components/EntryCard';
import {
  EducationSection,
  ExperienceSection,
  ProjectsSection,
  SkillsSection,
  SummarySection,
} from '@/features/editor/components/sections';

const SECTIONS = [
  { id: 'personal', label: 'Details' },
  { id: 'summary', label: 'Summary' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
  { id: 'education', label: 'Education' },
] as const;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; snapshot: EditorSnapshot };

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [data, setData] = useState<ResumeData | null>(null);
  const [score, setScore] = useState<FullScore | null>(null);
  const [active, setActive] = useState<string>('personal');

  /**
   * The revision the next save will be based on. Kept in a ref rather than
   * state because the autosave callback must read the newest value, and a
   * stale closure here is exactly what the revision guard exists to catch.
   */
  const revision = useRef(0);

  const load = useCallback(() => {
    if (!id) return;
    setState({ kind: 'loading' });

    getEditorResume(id)
      .then((snapshot) => {
        revision.current = snapshot.draft.revision;
        setData(snapshot.draft.data);
        setScore(snapshot.score);
        setState({ kind: 'loaded', snapshot });
      })
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not open that resume.',
        }),
      );
  }, [id]);

  useEffect(load, [load]);

  const { status, schedule, saveNow } = useAutosave<ResumeData>({
    save: async (value) => {
      if (!id) return;
      const result = await saveDraft(id, value, revision.current);
      revision.current = result.draft.revision;
      // The score comes back from the same request, so the number the user sees
      // always describes the text the server actually holds.
      setScore(result.score);
    },
    isConflict: (error) => error instanceof StaleDraftError,
  });

  /** Every section edit funnels through here, so autosave has one entry point. */
  const edit = useCallback(
    (patch: Partial<ResumeData>) => {
      setData((current) => {
        if (!current) return current;
        const next = { ...current, ...patch };
        schedule(next);
        return next;
      });
    },
    [schedule],
  );

  const revertToOriginal = useCallback(() => {
    if (state.kind !== 'loaded' || !state.snapshot.original) return;

    const original = state.snapshot.original.data;
    setData(original);
    schedule(original);
  }, [state, schedule]);

  const problemCount = useMemo(
    () =>
      score?.categories
        .flatMap((category) => category.findings)
        .filter((finding) => finding.severity !== 'good').length ?? 0,
    [score],
  );

  if (state.kind === 'loading') return <LoadingState rows={5} />;

  if (state.kind === 'error') {
    return <ErrorState title="Could not open this resume" description={state.message} onRetry={load} />;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{state.snapshot.resume.title}</h2>
          <p className="text-sm text-muted-foreground">
            Your original upload is kept untouched. Everything here is a working draft.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={status} onReload={load} />
          <Button variant="outline" size="sm" onClick={() => void saveNow()}>
            Save now
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[12rem_1fr_15rem]">
        <nav aria-label="Resume sections" className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#section-${section.id}`}
                  onClick={() => setActive(section.id)}
                  className={cn(
                    'block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
                    active === section.id
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card id="section-personal">
            <CardHeader>
              <CardTitle className="text-base">Your details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field
                id="personal-name"
                label="Full name"
                value={data.personal.fullName}
                onChange={(fullName) => edit({ personal: { ...data.personal, fullName } })}
              />
              <Field
                id="personal-email"
                label="Email"
                type="email"
                value={data.personal.email ?? ''}
                onChange={(email) => edit({ personal: { ...data.personal, email } })}
              />
              <Field
                id="personal-phone"
                label="Phone"
                value={data.personal.phone ?? ''}
                onChange={(phone) => edit({ personal: { ...data.personal, phone } })}
              />
              <Field
                id="personal-location"
                label="Location"
                value={data.personal.location ?? ''}
                onChange={(location) => edit({ personal: { ...data.personal, location } })}
              />
              <Field
                id="personal-linkedin"
                label="LinkedIn"
                value={data.personal.linkedin ?? ''}
                onChange={(linkedin) => edit({ personal: { ...data.personal, linkedin } })}
              />
              <Field
                id="personal-github"
                label="GitHub"
                value={data.personal.github ?? ''}
                onChange={(github) => edit({ personal: { ...data.personal, github } })}
              />
            </CardContent>
          </Card>

          <Card id="section-summary">
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <SummarySection value={data.summary} onChange={(summary) => edit({ summary })} />
            </CardContent>
          </Card>

          <Card id="section-experience">
            <CardHeader>
              <CardTitle className="text-base">Experience</CardTitle>
            </CardHeader>
            <CardContent>
              <ExperienceSection
                experience={data.experience}
                onChange={(experience) => edit({ experience })}
              />
            </CardContent>
          </Card>

          <Card id="section-projects">
            <CardHeader>
              <CardTitle className="text-base">Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectsSection projects={data.projects} onChange={(projects) => edit({ projects })} />
            </CardContent>
          </Card>

          <Card id="section-skills">
            <CardHeader>
              <CardTitle className="text-base">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <SkillsSection skills={data.skills} onChange={(skills) => edit({ skills })} />
            </CardContent>
          </Card>

          <Card id="section-education">
            <CardHeader>
              <CardTitle className="text-base">Education</CardTitle>
            </CardHeader>
            <CardContent>
              <EducationSection
                education={data.education}
                onChange={(education) => edit({ education })}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {score ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'text-3xl font-semibold tabular-nums',
                      scoreTone(score.finalScore).text,
                    )}
                    data-testid="live-score"
                  >
                    {score.finalScore}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updates as you edit. {problemCount} thing{problemCount === 1 ? '' : 's'} to
                  improve.
                </p>

                <ul className="space-y-1.5">
                  {score.categories.map((category) => (
                    <li key={category.category} className="space-y-1">
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-muted-foreground">{category.category}</span>
                        <span className="tabular-nums">{category.score}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', barTone(category.score))}
                          style={{ width: `${category.score}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {state.snapshot.original ? (
            <Button variant="outline" size="sm" className="w-full" onClick={revertToOriginal}>
              <RotateCcw />
              Revert to original
            </Button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
