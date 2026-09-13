import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { cn } from '@/lib/utils';
import {
  getEditorResume,
  saveDraft,
  StaleDraftError,
  type EditorSnapshot,
} from '@/features/editor/api/editorApi';
import { A4Page } from '@/features/templates/components/A4Page';
import { ResumeDocument } from '@/features/templates/ResumeDocument';
import { TEMPLATES, templateById, type TemplateId } from '@/features/templates/registry';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; snapshot: EditorSnapshot };

/**
 * Choose a template and see the resume on an A4 sheet.
 *
 * The choice is stored on the draft's metadata through the ordinary save, so it
 * travels with the resume — into versions, and into export — without a table of
 * its own.
 */
export function TemplatePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selected, setSelected] = useState<TemplateId>('modern');
  const [showMarkers, setShowMarkers] = useState(true);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setState({ kind: 'loading' });

    getEditorResume(id)
      .then((snapshot) => {
        setSelected(templateById(snapshot.draft.data.metadata.templateId).id);
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

  async function choose(templateId: TemplateId) {
    if (!id || state.kind !== 'loaded') return;

    // Shown immediately; the preview never waits on the network to change.
    setSelected(templateId);
    setSaveNote(null);

    const { draft } = state.snapshot;
    try {
      const result = await saveDraft(
        id,
        { ...draft.data, metadata: { ...draft.data.metadata, templateId } },
        draft.revision,
      );
      setState({ kind: 'loaded', snapshot: { ...state.snapshot, draft: result.draft } });
    } catch (error) {
      setSaveNote(
        error instanceof StaleDraftError
          ? 'This resume was changed in another tab, so the template choice was not saved. Reload to pick it again.'
          : 'The template is showing, but the choice could not be saved.',
      );
    }
  }

  if (state.kind === 'loading') return <LoadingState rows={5} />;
  if (state.kind === 'error') {
    return <ErrorState title="Could not open this resume" description={state.message} onRetry={load} />;
  }

  const resume = state.snapshot.draft.data;
  const template = templateById(selected);
  const unchecked = [...resume.experience, ...resume.projects]
    .flatMap((entry) => entry.bullets)
    .filter((bullet) => bullet.source === 'ai' && !bullet.verified).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to the editor">
            <Link to={`/editor/${id}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{state.snapshot.resume.title}</h2>
            <p className="text-sm text-muted-foreground">
              Every template is single-column, so filters read it in the same order you do.
            </p>
          </div>
        </div>

        {unchecked > 0 ? (
          <Button variant="outline" size="sm" onClick={() => setShowMarkers((on) => !on)}>
            {showMarkers ? <EyeOff /> : <Eye />}
            {showMarkers ? 'Hide' : 'Show'} {unchecked} unchecked AI line{unchecked === 1 ? '' : 's'}
          </Button>
        ) : null}
      </div>

      {saveNote ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveNote}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ul className="space-y-2" aria-label="Templates">
          {TEMPLATES.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => void choose(option.id)}
                aria-pressed={option.id === selected}
                className={cn(
                  'w-full rounded-xl border p-3 text-left transition-colors',
                  option.id === selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-muted',
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {option.name}
                  {option.id === selected ? <Check className="size-4 text-primary" /> : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.bestFor}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0">
          <A4Page>
            <ResumeDocument
              resume={resume}
              style={template.style}
              mode={showMarkers ? 'preview' : 'print'}
            />
          </A4Page>
        </div>
      </div>
    </div>
  );
}
