import { AlertTriangle, Check, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

/**
 * Rewrite options, shown for a decision rather than applied.
 *
 * Nothing here changes the resume on its own: each option needs a deliberate
 * click, and the current text stays on screen next to it so the choice is
 * between two things the user can actually compare.
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
  onAccept: (text: string) => void;
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
        <Button variant="ghost" size="icon" aria-label="Dismiss suggestions" onClick={onDismiss}>
          <X />
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-background p-2.5">
        <p className="mb-1 text-xs font-medium text-muted-foreground">What you have now</p>
        <p className="text-sm">{currentText}</p>
      </div>

      <ul className="space-y-2">
        {state.options.map((option, index) => (
          <li
            key={`${index}-${option.text.slice(0, 24)}`}
            className={cn(
              'space-y-2 rounded-lg border bg-card p-3',
              option.requiresVerification ? 'border-warning/40' : 'border-border',
            )}
          >
            <p className="text-sm">{option.text}</p>
            <p className="text-xs text-muted-foreground">{option.explanation}</p>

            {option.requiresVerification ? (
              <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Needs a detail your resume does not contain. Replace the placeholder with a real
                figure before using this, or pick the other option.
              </p>
            ) : null}

            <Button size="sm" variant="outline" onClick={() => onAccept(option.text)}>
              <Check />
              Use this
            </Button>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Nothing changes until you choose. You can undo afterwards.
      </p>
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
