import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { JobAnalysis, RequirementCategory } from '@/features/job-match/api/jobApi';

const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  skill: 'Skills',
  responsibility: 'Responsibilities',
  qualification: 'Qualifications',
  keyword: 'Keywords',
};

const CATEGORY_ORDER: RequirementCategory[] = [
  'skill',
  'responsibility',
  'qualification',
  'keyword',
];

/**
 * What the posting actually asks for, grouped and marked.
 *
 * "Required" is shown only where the posting itself says so. Most listings pad
 * a wish list with things that are not deal-breakers, and treating every line
 * as mandatory would talk people out of applying for jobs they would get.
 */
export function RequirementList({ analysis }: { analysis: JobAnalysis }) {
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: analysis.requirements.filter((requirement) => requirement.category === category),
  })).filter((group) => group.items.length > 0);

  const requiredCount = analysis.requirements.filter((r) => r.required).length;

  return (
    <div className="space-y-4" data-testid="requirement-list">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What this role asks for</CardTitle>
          <CardDescription>
            {analysis.requirements.length} requirement
            {analysis.requirements.length === 1 ? '' : 's'}, of which {requiredCount}{' '}
            {requiredCount === 1 ? 'is' : 'are'} stated as essential. Everything here is read
            from the posting — nothing is inferred.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {grouped.map((group) => (
            <div key={group.category} className="space-y-2">
              <h4 className="text-sm font-semibold">{CATEGORY_LABELS[group.category]}</h4>
              <ul className="space-y-1.5">
                {group.items.map((requirement) => (
                  <li key={requirement.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        requirement.required ? 'bg-destructive' : 'bg-muted-foreground/40',
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{requirement.text}</span>
                    {requirement.required ? (
                      <Badge variant="outline" className="shrink-0 border-destructive/30 text-destructive">
                        Essential
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {analysis.keywords.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Keywords</CardTitle>
            <CardDescription>
              The terms a filter is most likely to look for. Matching them against your resume
              comes next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-1.5">
              {analysis.keywords.map((keyword) => (
                <li
                  key={keyword}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
