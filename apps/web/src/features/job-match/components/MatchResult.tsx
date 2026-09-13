import { AlertTriangle, Check, CircleDashed, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { scoreTone } from '@/components/ScoreRing';
import { cn } from '@/lib/utils';
import type { JobAnalysis, JobRequirement } from '@/features/job-match/api/jobApi';
import type { MatchState, SkillMatch } from '@/features/job-match/api/matchApi';

const STATE_ORDER: MatchState[] = ['missing', 'needsVerification', 'partial', 'matched'];

const STATE_META: Record<
  MatchState,
  { label: string; blurb: string; icon: typeof Check; tone: string; dot: string }
> = {
  matched: {
    label: 'Shown in your resume',
    blurb: 'Your resume demonstrates this, and here is where.',
    icon: Check,
    tone: 'text-success',
    dot: 'bg-success',
  },
  partial: {
    label: 'Partly shown',
    blurb: 'Related evidence exists, but it does not cover the whole requirement.',
    icon: CircleDashed,
    tone: 'text-primary',
    dot: 'bg-primary',
  },
  needsVerification: {
    label: 'Worth checking',
    blurb:
      'This may well be true of you, but your resume does not say it clearly enough for us to claim it. If you have done this, say so explicitly.',
    icon: HelpCircle,
    tone: 'text-warning',
    dot: 'bg-warning',
  },
  missing: {
    label: 'Not in your resume',
    blurb:
      'Your resume does not show this. That is a statement about the document, not about you — if you have the experience, it needs to be on the page.',
    icon: AlertTriangle,
    tone: 'text-destructive',
    dot: 'bg-destructive',
  },
};

/**
 * The match, grouped by verdict.
 *
 * Ordered worst-first on purpose: the point of this screen is what to fix
 * before applying, and a list that opens with everything already working buries
 * that under good news.
 */
export function MatchResult({
  analysis,
  matches,
  matchScore,
}: {
  analysis: JobAnalysis;
  matches: SkillMatch[];
  matchScore: number;
}) {
  const byId = new Map(matches.map((match) => [match.requirementId, match]));
  const tone = scoreTone(matchScore);

  const groups = STATE_ORDER.map((state) => ({
    state,
    items: analysis.requirements
      .map((requirement) => ({ requirement, match: byId.get(requirement.id) }))
      .filter(({ match }) => (match?.state ?? 'missing') === state),
  })).filter((group) => group.items.length > 0);

  const essentialGaps = analysis.requirements.filter(
    (requirement) =>
      requirement.required &&
      ['missing', 'needsVerification'].includes(byId.get(requirement.id)?.state ?? 'missing'),
  ).length;

  return (
    <div className="space-y-4" data-testid="match-result">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={cn('text-3xl font-semibold tabular-nums', tone.text)}>
              {matchScore}
            </span>
            <span className="text-sm text-muted-foreground">/ 100 match</span>
          </div>
          <CardDescription>
            {essentialGaps === 0
              ? 'Your resume shows every requirement the posting calls essential.'
              : `${essentialGaps} essential requirement${essentialGaps === 1 ? '' : 's'} ${
                  essentialGaps === 1 ? 'is' : 'are'
                } not clearly shown in your resume. Those are worth fixing before you apply.`}
          </CardDescription>
        </CardHeader>
      </Card>

      {groups.map((group) => {
        const meta = STATE_META[group.state];
        const Icon = meta.icon;

        return (
          <Card key={group.state}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className={cn('size-4', meta.tone)} aria-hidden="true" />
                {meta.label}
                <span className="text-sm font-normal text-muted-foreground">
                  ({group.items.length})
                </span>
              </CardTitle>
              <CardDescription>{meta.blurb}</CardDescription>
            </CardHeader>

            <CardContent>
              <ul className="space-y-2.5">
                {group.items.map(({ requirement, match }) => (
                  <li key={requirement.id} className="space-y-1">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', meta.dot)}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-sm">{requirement.text}</span>
                      {requirement.required ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          Essential
                        </span>
                      ) : null}
                    </div>

                    {/*
                      The quote is the whole basis for believing the verdict, so
                      it is shown rather than summarised. A match with nothing to
                      point at would be an assertion.
                    */}
                    {match?.evidence ? (
                      <p className="ml-3.5 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                        {match.evidence}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Matching reads your resume, not your career. Anything marked as not shown may still be
        something you have done — it just is not on the page, which is the part a filter reads.
      </p>
    </div>
  );
}

export type { JobRequirement };
