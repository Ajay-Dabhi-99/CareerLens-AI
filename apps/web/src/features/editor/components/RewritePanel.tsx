import { useId, useState } from 'react';
import { AlertTriangle, Check, Pencil, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DiffView } from '@/features/editor/components/DiffView';

export interface RewriteOption {
  text: string;
  explanation: string;
  requiresVerification: boolean;
}

export type RewriteState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; options: RewriteOption[] }
  | { kind: 'error'; message: string };

/** What the user did with a suggestion, so the history can record it honestly. */
export interface AcceptedRewrite {
  text: string;
  edited: boolean;
}

/**
 * One suggestion, shown as a diff against what the user has now.
 *
 * Three ways out, and they are not the same: take it, take it as a starting
 * point, or leave it. The middle one matters most — a suggestion is usually
 * nearly right, and without Edit the choice collapses into "accept wording you
 * half-agree with" or "lose it entirely".
 */
function OptionCard({
  option,
  currentText,
  onAccept,
}: {
  option: RewriteOption;
  currentText: string;
  onAccept: (accepted: AcceptedRewrite) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(option.text);
  const textareaId = useId();

  return (
    <li
      className={cn(
        'space-y-2.5 rounded-lg border bg-card p-3',
        option.requiresVerification ? 'border-warning/40' : 'border-border',
      )}
    >
      {editing ? (
        <div className="space-y-2">
          {/* Associated with the box, so clicking the label focuses it and a
              screen reader announces what the field is for. */}
          <label
            htmlFor={textareaId}
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Your version
          </label>
          <textarea
            id={textareaId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ) : (
        <DiffView before={currentText} after={option.text} />
      )}

      <p className="text-xs text-muted-foreground">{option.explanation}</p>

      {option.requiresVerification ? (
        <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Needs a detail your resume does not contain. Replace the placeholder with a real figure
          before using this, or pick the other option.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!draft.trim()}
              onClick={() => onAccept({ text: draft.trim(), edited: true })}
            >
              <Check />
              Use my version
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Back to the suggestion
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAccept({ text: option.text, edited: false })}
            >
              <Check />
              Accept
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil />
              Edit first
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Rewrite options, shown for a decision rather than applied.
 *
 * Nothing here changes the resume on its own: each option needs a deliberate
 * click, and the diff shows exactly which words would move.
 *
 * An option flagged as needing verification is marked, not hidden. The model is
 * forbidden from inventing facts, so when a stronger line would need a number
 * the resume does not contain, it says so and leaves a placeholder. That is a
 * prompt for the user, never something to paste unread.
 */
export function RewritePanel({
  state,
  currentText,
  onAccept,
  onDismiss,
  onRetry,
}: {
  state: RewriteState;
  currentText: string;
  onAccept: (accepted: AcceptedRewrite) => void;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'loading') {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm"
        aria-live="polite"
      >
        <Sparkles className="size-4 animate-pulse text-primary" aria-hidden="true" />
        Looking at what you wrote…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
      >
        <span className="flex-1">{state.message}</span>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3"
      data-testid="rewrite-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Suggested rewrites
        </p>
        <Button variant="ghost" size="icon" aria-label="Reject these suggestions" onClick={onDismiss}>
          <X />
        </Button>
      </div>

      <ul className="space-y-2">
        {state.options.map((option, index) => (
          <OptionCard
            key={`${index}-${option.text.slice(0, 24)}`}
            option={option}
            currentText={currentText}
            onAccept={onAccept}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Nothing changes until you choose, and anything you accept can be put back later.
        </p>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Reject all
        </Button>
      </div>
    </div>
  );
}

/** The button that asks for a rewrite. Separate so sections stay readable. */
export function RewriteButton({
  onClick,
  disabled,
  label = 'Improve with AI',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled}>
      <Sparkles />
      {label}
    </Button>
  );
}
