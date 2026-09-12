import { useMemo } from 'react';
import { afterParts, beforeParts, diffWords, type DiffPart } from '@/features/editor/lib/diff';
import { cn } from '@/lib/utils';

function Side({
  label,
  parts,
  tone,
}: {
  label: string;
  parts: DiffPart[];
  tone: 'removed' | 'added';
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-2.5 text-sm">
        {parts.map((part, index) =>
          part.kind === 'same' ? (
            <span key={index}>{part.text}</span>
          ) : (
            <mark
              key={index}
              className={cn(
                'rounded px-0.5',
                tone === 'removed'
                  ? 'bg-destructive/15 text-destructive line-through decoration-destructive/40'
                  : 'bg-success/15 text-success',
              )}
            >
              {part.text}
            </mark>
          ),
        )}
      </p>
    </div>
  );
}

/**
 * Side by side on a wide screen, stacked on a narrow one.
 *
 * Stacked rather than side-by-side on mobile because two columns of wrapped
 * prose at phone width are unreadable, and an unreadable diff is worse than
 * plain before-and-after text.
 */
export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="diff-view">
      <Side label="Now" parts={beforeParts(parts)} tone="removed" />
      <Side label="Suggested" parts={afterParts(parts)} tone="added" />
    </div>
  );
}
