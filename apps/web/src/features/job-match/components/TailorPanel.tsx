import { useState } from 'react';
import { AlertTriangle, Check, FilePlus2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DiffView } from '@/features/editor/components/DiffView';
import { cn } from '@/lib/utils';

export interface TailorSuggestion {
  id: string;
  section: string;
  priority: 'high' | 'medium' | 'low';
  issue: string;
  whyItMatters: string;
  originalText?: string;
  suggestedText?: string;
  requiresVerification: boolean;
  confidence: number;
}

const PRIORITY_ORDER: Record<TailorSuggestion['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Targeted suggestions, approved one at a time, then written to a new version.
 *
 * Nothing is applied to the working copy. Tailoring produces a sibling version
 * named after the posting, so a resume tailored for one job cannot quietly
 * become the resume sent to a different one.
 *
 * A suggestion with no replacement text is advice rather than an edit, and is
 * shown as such: it tells the user what to do, and only they can do it.
 */
export function TailorPanel({
  suggestions,
  defaultName,
  creating,
  onCreate,
  onDismiss,
}: {
  suggestions: TailorSuggestion[];
  defaultName: string;
  creating: boolean;
  onCreate: (name: string, accepted: TailorSuggestion[]) => void;
  onDismiss: () => void;
}) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [name, setName] = useState(defaultName);

  const ordered = [...suggestions].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );

  const applicable = ordered.filter((s) => s.originalText && s.suggestedText);
  const advice = ordered.filter((s) => !s.originalText || !s.suggestedText);

  function toggle(id: string) {
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4" data-testid="tailor-panel">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-5 text-primary" aria-hidden="true" />
                Tailoring suggestions
              </CardTitle>
              <CardDescription>
                Changes of emphasis, not of fact. Nothing here adds experience you do not have —
                where the posting asks for something your resume genuinely does not show, there
                is no suggestion to make.
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" aria-label="Dismiss suggestions" onClick={onDismiss}>
              <X />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {applicable.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pick the changes you want</CardTitle>
            <CardDescription>
              {accepted.size} of {applicable.length} selected. Your working copy stays as it is
              either way.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ul className="space-y-3">
              {applicable.map((suggestion) => {
                const isOn = accepted.has(suggestion.id);

                return (
                  <li
                    key={suggestion.id}
                    className={cn(
                      'space-y-2 rounded-xl border p-3',
                      isOn ? 'border-primary bg-primary/5' : 'border-border bg-card',
                    )}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        {suggestion.section}
                      </span>
                      <p className="min-w-0 flex-1 text-sm font-medium">{suggestion.issue}</p>
                    </div>

                    <DiffView
                      before={suggestion.originalText!}
                      after={suggestion.suggestedText!}
                    />

                    <p className="text-xs text-muted-foreground">{suggestion.whyItMatters}</p>

                    {suggestion.requiresVerification ? (
                      <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        Check this is true of you before using it.
                      </p>
                    ) : null}

                    <Button
                      size="sm"
                      variant={isOn ? 'default' : 'outline'}
                      onClick={() => toggle(suggestion.id)}
                    >
                      <Check />
                      {isOn ? 'Included' : 'Include this'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {advice.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Only you can do these</CardTitle>
            <CardDescription>
              These need a fact or a decision from you, so there is no text to swap in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {advice.map((suggestion) => (
                <li key={suggestion.id} className="space-y-0.5">
                  <p className="text-sm">{suggestion.issue}</p>
                  <p className="text-xs text-muted-foreground">{suggestion.whyItMatters}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FilePlus2 className="size-4" aria-hidden="true" />
            Save as a tailored version
          </CardTitle>
          <CardDescription>
            Creates a new version alongside your working copy and your original. Neither is
            changed, so this cannot become the resume you send somewhere else by accident.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tailored-name">Name this version</Label>
            <Input
              id="tailored-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <Button
            disabled={creating || !name.trim()}
            onClick={() =>
              onCreate(
                name.trim(),
                applicable.filter((suggestion) => accepted.has(suggestion.id)),
              )
            }
          >
            <FilePlus2 />
            {creating
              ? 'Creating…'
              : accepted.size === 0
                ? 'Create a copy without changes'
                : `Create with ${accepted.size} change${accepted.size === 1 ? '' : 's'}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
