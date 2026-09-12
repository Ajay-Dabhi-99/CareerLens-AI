import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { barTone, scoreTone } from '@/components/ScoreRing';
import { cn } from '@/lib/utils';
import { FullScoreResult } from '@/features/resume/components/FullScoreResult';
import type { FullScore } from '@/features/resume/api/resumeApi';

/**
 * The deterministic score, deliberately compact.
 *
 * It used to lead the page. It now sits below the AI review as a single line
 * that expands, because a number tells you where you stand and the review tells
 * you what to do — and only one of those is worth the top of the screen.
 */
export function ScorePanel({ score }: { score: FullScore }) {
  const [expanded, setExpanded] = useState(false);
  const tone = scoreTone(score.finalScore);

  return (
    <div className="space-y-4" data-testid="score-panel">
      <Card>
        <CardContent className="p-4">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="flex w-full items-center gap-4 text-left"
          >
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn('text-2xl font-semibold tabular-nums', tone.text)}
                data-testid="final-score"
              >
                {score.finalScore}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Resume Health · {tone.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                How well the document reads to a filter, not a judgement of your experience.
              </p>
            </div>

            <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
              {score.categories.map((category) => (
                <span
                  key={category.category}
                  title={`${category.category}: ${category.score}`}
                  className={cn('h-6 w-1.5 rounded-full', barTone(category.score))}
                  style={{ opacity: 0.35 + (category.score / 100) * 0.65 }}
                />
              ))}
            </div>

            <span className="shrink-0 text-xs text-muted-foreground">
              {expanded ? 'Hide' : 'Details'}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
        </CardContent>
      </Card>

      {expanded ? <FullScoreResult score={score} /> : null}
    </div>
  );
}
