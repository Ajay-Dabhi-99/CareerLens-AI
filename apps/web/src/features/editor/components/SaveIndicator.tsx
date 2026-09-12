import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SaveStatus } from '@/features/editor/hooks/useAutosave';

/**
 * Says what is actually true about the user's work.
 *
 * "Saved" appears only once the server has confirmed it. An optimistic tick
 * that appears on keypress is a lie the one time it matters, which is the time
 * the request failed.
 */
export function SaveIndicator({ status, onReload }: { status: SaveStatus; onReload?: () => void }) {
  if (status.kind === 'conflict') {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{status.message}</span>
        {onReload ? (
          <Button size="sm" variant="outline" onClick={onReload}>
            <RefreshCw />
            Reload
          </Button>
        ) : null}
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        <CloudOff className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">Not saved. {status.message}</span>
        <Button size="sm" variant="outline" onClick={status.retry}>
          Try again
        </Button>
      </div>
    );
  }

  const label =
    status.kind === 'saving'
      ? 'Saving…'
      : status.kind === 'pending'
        ? 'Unsaved changes'
        : status.kind === 'saved'
          ? 'Saved'
          : 'Up to date';

  return (
    <p
      aria-live="polite"
      className={cn(
        'flex items-center gap-1.5 text-xs',
        status.kind === 'saved' ? 'text-success' : 'text-muted-foreground',
      )}
    >
      {status.kind === 'saving' ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : status.kind === 'saved' ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : null}
      {label}
    </p>
  );
}
