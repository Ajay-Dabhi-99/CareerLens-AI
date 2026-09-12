import { AlertTriangle, CheckCircle2, Info, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreRing, barTone } from '@/components/ScoreRing';
import { cn } from '@/lib/utils';
import type { AtsFinding, PublicScore } from '@/features/quick-analysis/api/quickAnalysisApi';

function FindingRow({ finding }: { finding: AtsFinding }) {
  const Icon =
    finding.severity === 'good' ? CheckCircle2 : finding.severity === 'critical' ? AlertTriangle : Info;
  const tone =
    finding.severity === 'good'
      ? 'text-success'
      : finding.severity === 'critical'
        ? 'text-destructive'
        : 'text-warning';

  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} aria-hidden="true" />
      <span>{finding.message}</span>
    </li>
  );
}

export function ScoreResult({ score }: { score: PublicScore }) {
  return (
    <div className="space-y-4" data-testid="score-result">
      <Card>
        <CardHeader>
          <CardTitle>Your Resume Health score</CardTitle>
          <CardDescription>
            Weighted across eight categories. This is an ATS-style score, not the exact number any
            one company&apos;s system produces.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={score.finalScore} />

            <ul className="w-full flex-1 space-y-2.5">
              {score.categories.map((category) => (
                <li key={category.category} className="space-y-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium">{category.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {category.score} · {Math.round(category.weight * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', barTone(category.score))}
                      style={{ width: `${category.score}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What stood out</CardTitle>
          <CardDescription>
            The most important {score.findings.length} of {score.totalFindings} findings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2.5">
            {score.findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </ul>

          {score.withheldFindings > 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                {score.withheldFindings} more finding{score.withheldFindings === 1 ? '' : 's'}
              </div>
              <p className="text-sm text-muted-foreground">
                Log in to see every finding, what to fix first, and AI rewrites you approve line by
                line.
              </p>
              <Button asChild size="sm">
                <Link to="/signup">Log in to see them all</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
