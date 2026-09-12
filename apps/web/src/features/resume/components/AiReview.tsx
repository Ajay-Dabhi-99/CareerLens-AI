import { ArrowRight, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ResumeAnalysis, ReviewPriority } from '@/features/resume/api/reviewApi';

const PRIORITY_ORDER: Record<ReviewPriority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLE: Record<ReviewPriority, { badge: string; label: string }> = {
  high: { badge: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Do first' },
  medium: { badge: 'bg-warning/10 text-warning border-warning/20', label: 'Then this' },
  low: { badge: 'bg-muted text-muted-foreground border-border', label: 'Nice to have' },
};

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  certifications: 'Certifications',
};

function sectionLabel(section: string): string {
  const key = section.trim().toLowerCase();
  return SECTION_LABELS[key] ?? section;
}

/**
 * The AI review, and the main thing a signed-in user is here for.
 *
 * Ordered by what someone actually does next: the prioritised actions come
 * first, then the balance of strengths and weaknesses, then the per-section
 * detail for anyone who wants to work through it properly.
 */
export function AiReview({
  analysis,
  createdAt,
  onRefresh,
  refreshing = false,
}: {
  analysis: ResumeAnalysis;
  createdAt?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const actions = [...analysis.priorityActions].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );

  return (
    <div className="space-y-4" data-testid="ai-review">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" aria-hidden="true" />
                AI review
              </CardTitle>
              <CardDescription>
                Read against your resume as written. Nothing here is invented: where the review
                needs a fact your resume does not contain, it says so instead of guessing.
              </CardDescription>
            </div>

            {onRefresh ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={refreshing}
                className="shrink-0"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                {refreshing ? 'Reviewing…' : 'Review again'}
              </Button>
            ) : null}
          </div>
        </CardHeader>

        {actions.length > 0 ? (
          <CardContent>
            <h3 className="mb-3 text-sm font-semibold">What to change first</h3>
            <ol className="space-y-3">
              {actions.map((action, index) => (
                <li
                  key={`${action.priority}-${action.action}`}
                  className="rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{action.action}</p>
                        <Badge
                          variant="outline"
                          className={cn('shrink-0', PRIORITY_STYLE[action.priority].badge)}
                        >
                          {PRIORITY_STYLE[action.priority].label}
                        </Badge>
                      </div>
                      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                        <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {action.reason}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ThumbsUp className="size-4 text-success" aria-hidden="true" />
              What is working
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysis.pros.length > 0 ? (
              <ul className="space-y-2">
                {analysis.pros.map((pro) => (
                  <li key={pro} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                    {pro}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                The review did not single out any strengths yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ThumbsDown className="size-4 text-warning" aria-hidden="true" />
              What is holding it back
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysis.cons.length > 0 ? (
              <ul className="space-y-2">
                {analysis.cons.map((con) => (
                  <li key={con} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                    {con}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing significant was flagged.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {analysis.sectionReviews.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Section by section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analysis.sectionReviews.map((section) => (
              <div key={section.section} className="space-y-2">
                <h4 className="text-sm font-semibold">{sectionLabel(section.section)}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ul className="space-y-1.5">
                    {section.strengths.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-1.5">
                    {section.weaknesses.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {createdAt ? (
        <p className="text-xs text-muted-foreground">
          Reviewed {new Date(createdAt).toLocaleString()}. Suggestions are advice, not facts about
          you: check anything you are unsure of before putting it on your resume.
        </p>
      ) : null}
    </div>
  );
}
