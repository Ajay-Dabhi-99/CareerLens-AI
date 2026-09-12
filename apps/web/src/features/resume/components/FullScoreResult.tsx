import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreRing, barTone } from '@/components/ScoreRing';
import { cn } from '@/lib/utils';
import type { AtsFinding, FullScore } from '@/features/resume/api/resumeApi';

const CATEGORY_LABELS: Record<string, string> = {
  atsCompatibility: 'Structure',
  skillsQuality: 'Skills',
  experienceStrength: 'Experience',
  impactAchievements: 'Impact',
  keywordQuality: 'Keywords',
  readability: 'Readability',
  formatting: 'Formatting',
  professionalismCompleteness: 'Completeness',
};

const SEVERITY_ORDER = { critical: 0, warning: 1, good: 2 } as const;

function FindingRow({ finding }: { finding: AtsFinding }) {
  const Icon =
    finding.severity === 'good'
      ? CheckCircle2
      : finding.severity === 'critical'
        ? AlertTriangle
        : Info;
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

/**
 * The signed-in view: every finding, grouped by category.
 *
 * Deliberately different from the anonymous summary, which shows the score and
 * category breakdown but withholds the detail.
 */
export function FullScoreResult({ score }: { score: FullScore }) {
  const totalFindings = score.categories.reduce(
    (total, category) => total + category.findings.length,
    0,
  );

  const problems = score.categories
    .flatMap((category) => category.findings)
    .filter((finding) => finding.severity !== 'good')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return (
    <div className="space-y-4" data-testid="full-score">
      <Card>
        <CardHeader>
          <CardTitle>Resume Health score</CardTitle>
          <CardDescription>
            How well this document communicates your experience — not a judgement of the
            experience itself. Compare it against your own next version rather than against
            anyone else&apos;s.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={score.finalScore} />

            <ul className="w-full flex-1 space-y-2.5">
              {score.categories.map((category) => (
                <li key={category.category} className="space-y-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium">
                      {CATEGORY_LABELS[category.category] ?? category.category}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
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

      {problems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fix these first</CardTitle>
            <CardDescription>
              Ordered by severity, out of {totalFindings} checks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {problems.map((finding) => (
                <FindingRow key={finding.id} finding={finding} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Every check, by category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {score.categories.map((category) => (
            <div key={category.category} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">
                  {CATEGORY_LABELS[category.category] ?? category.category}
                </h4>
                <Badge variant={category.score >= 60 ? 'success' : 'outline'}>
                  {category.score}
                </Badge>
              </div>
              <ul className="space-y-2">
                {category.findings.map((finding) => (
                  <FindingRow key={finding.id} finding={finding} />
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
