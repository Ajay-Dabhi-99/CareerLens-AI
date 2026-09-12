import { useState } from 'react';
import { History, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DiffView } from '@/features/editor/components/DiffView';
import type { AiChange } from '@/features/editor/api/editorApi';

const TARGET_LABELS: Record<AiChange['target'], string> = {
  summary: 'Summary',
  bullet: 'Bullet',
  project: 'Project',
  skills: 'Skills',
};

/**
 * Everything the AI changed, and a way to put any of it back.
 *
 * This exists because undo in the editor lives in browser memory: reload the
 * page and an accepted rewrite was permanent. "Every AI change is reversible"
 * has to hold tomorrow as well as this afternoon, so the record is on the
 * server and the revert is a real operation against the draft.
 */
export function AiChangeList({
  changes,
  onRevert,
  revertingId,
  error,
}: {
  changes: AiChange[];
  onRevert: (changeId: string) => void;
  revertingId: string | null;
  error: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (changes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" aria-hidden="true" />
          AI changes
        </CardTitle>
        <CardDescription>
          Everything the AI has changed on this resume. Any of it can be put back, including after
          you close the page.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <ul className="space-y-2">
          {changes.map((change) => {
            const isOpen = expanded === change.id;

            return (
              <li key={change.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {TARGET_LABELS[change.target]}
                  </span>

                  {change.edited ? (
                    <span className="text-[11px] text-muted-foreground">
                      you edited the suggestion
                    </span>
                  ) : null}

                  {change.revertedAt ? (
                    <span className="text-[11px] text-muted-foreground">put back</span>
                  ) : null}

                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(change.createdAt).toLocaleString()}
                  </span>
                </div>

                <p className="mt-1.5 truncate text-sm">{change.afterText}</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(isOpen ? null : change.id)}
                  >
                    {isOpen ? 'Hide' : 'What changed'}
                  </Button>

                  {change.revertedAt ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revertingId === change.id}
                      onClick={() => onRevert(change.id)}
                    >
                      <Undo2 />
                      {revertingId === change.id ? 'Putting back…' : 'Put back'}
                    </Button>
                  )}
                </div>

                {isOpen ? (
                  <div className="mt-2">
                    <DiffView before={change.beforeText} after={change.afterText} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
