import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { ATS_CATEGORY_LABELS } from '@career-lens-ai/types';
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
import { useUndoable } from '@/features/editor/hooks/useUndoable';
import { useRewriteController } from '@/features/editor/hooks/useRewrite';
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

/**
 * Adding or removing an entry is a structural change, and must stay separately
 * undoable even when it lands in the middle of a burst of typing. Comparing
 * list lengths detects that without every section having to declare it.
 */
function isStructural(before: ResumeData, after: ResumeData): boolean {
  const lists = ['experience', 'projects', 'skills', 'education', 'certifications'] as const;
  return lists.some((key) => before[key].length !== after[key].length);
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [score, setScore] = useState<FullScore | null>(null);
  const [active, setActive] = useState<string>('personal');
  const [confirmingRevert, setConfirmingRevert] = useState(false);

  const {
    present: data,
    presentRef,
    push,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  } = useUndoable<ResumeData | null>(null);

  // One rewrite at a time anywhere on the page, so only one AI call can ever
  // be in flight against a small free-tier quota.
  const rewrite = useRewriteController(id);

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
        // reset rather than push: undoing into a previously open resume would
        // restore another document's content over this one.
        reset(snapshot.draft.data);
        setScore(snapshot.score);
        setState({ kind: 'loaded', snapshot });
      })
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not open that resume.',
        }),
      );
  }, [id, reset]);

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

  /** Every section edit funnels through here, so history and autosave agree. */
  const edit = useCallback(
    (patch: Partial<ResumeData>) => {
      const current = presentRef.current;
      if (!current) return;

      const next = { ...current, ...patch };
      push(next, { coalesce: !isStructural(current, next) });
      schedule(next);
    },
    [presentRef, push, schedule],
  );

  /**
   * Undo and redo save what they restore.
   *
   * Leaving the restored state unsaved would mean the database still held the
   * mistake the user just undid, and the next reload would bring it back.
   */
  const handleUndo = useCallback(() => {
    const restored = undo();
    if (restored) schedule(restored);
  }, [undo, schedule]);

  const handleRedo = useCallback(() => {
    const restored = redo();
    if (restored) schedule(restored);
  }, [redo, schedule]);

  const revertToOriginal = useCallback(() => {
    if (state.kind !== 'loaded' || !state.snapshot.original) return;

    const original = state.snapshot.original.data;
    // Structural by definition, and undoable: reverting by accident should not
    // be the one action in this editor that cannot be taken back.
    push(original, { coalesce: false });
    schedule(original);
    setConfirmingRevert(false);
  }, [state, push, schedule]);

  /** The shortcuts people try without thinking, so they should work. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        handleRedo();
      } else if (key === 's') {
        // Nothing to save that autosave will not do, but people press it to
        // reassure themselves, and the browser's save dialog is not the answer.
        event.preventDefault();
        void saveNow();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, saveNow]);

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
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to your resumes"
            onClick={async () => {
              // Saves before leaving rather than losing whatever sits inside
              // the debounce window.
              await saveNow();
              navigate('/resumes');
            }}
          >
            <ArrowLeft />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{state.snapshot.resume.title}</h2>
            <p className="text-sm text-muted-foreground">
              Your original upload is kept untouched. Everything here is a working draft.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveIndicator status={status} onReload={load} />

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={handleUndo}
            >
              <Undo2 />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={handleRedo}
            >
              <Redo2 />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={() => void saveNow()}>
            Save now
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await saveNow();
              navigate('/resumes');
            }}
          >
            Done
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
              <SummarySection
                value={data.summary}
                onChange={(summary) => edit({ summary })}
                rewrite={rewrite}
              />
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
                rewrite={rewrite}
              />
            </CardContent>
          </Card>

          <Card id="section-projects">
            <CardHeader>
              <CardTitle className="text-base">Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectsSection
                projects={data.projects}
                onChange={(projects) => edit({ projects })}
                rewrite={rewrite}
              />
            </CardContent>
          </Card>

          <Card id="section-skills">
            <CardHeader>
              <CardTitle className="text-base">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <SkillsSection
                skills={data.skills}
                onChange={(skills) => edit({ skills })}
                rewrite={rewrite}
              />
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
                        <span className="text-muted-foreground">
                          {ATS_CATEGORY_LABELS[
                            category.category as keyof typeof ATS_CATEGORY_LABELS
                          ] ?? category.category}
                        </span>
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
            confirmingRevert ? (
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  This replaces everything here with your original upload. You can undo it
                  afterwards.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={revertToOriginal}>
                    Revert
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmingRevert(false)}>
                    Keep editing
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setConfirmingRevert(true)}
              >
                <RotateCcw />
                Revert to original
              </Button>
            )
          ) : null}
        </aside>
      </div>
    </div>
  );
}
