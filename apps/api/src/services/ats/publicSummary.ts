import type { AtsCategory, AtsFinding, AtsScore } from '@career-lens-ai/types';
import { ATS_CATEGORY_LABELS } from '@career-lens-ai/types';

export interface PublicCategorySummary {
  category: AtsCategory;
  label: string;
  score: number;
  weight: number;
}

export interface PublicAtsSummary {
  finalScore: number;
  categories: PublicCategorySummary[];
  /** A deliberately small slice of the findings. */
  findings: AtsFinding[];
  totalFindings: number;
  withheldFindings: number;
}

const FREE_FINDING_LIMIT = 3;

const SEVERITY_ORDER = { critical: 0, warning: 1, good: 2 } as const;

/**
 * Builds the anonymous view of a score.
 *
 * The score and per-category breakdown are given in full — that is the promise
 * the landing page makes. The detailed findings are the gated part, so only the
 * most severe few are included and the rest are counted rather than sent. The
 * withheld findings never leave the server, so there is nothing for an
 * anonymous client to recover from the response.
 */
export function toPublicSummary(score: AtsScore): PublicAtsSummary {
  const allFindings = score.categories.flatMap((category) => category.findings);

  const ranked = [...allFindings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const shown = ranked.slice(0, FREE_FINDING_LIMIT);

  return {
    finalScore: score.finalScore,
    categories: score.categories.map((category) => ({
      category: category.category,
      label: ATS_CATEGORY_LABELS[category.category],
      score: category.score,
      weight: category.weight,
    })),
    findings: shown,
    totalFindings: allFindings.length,
    withheldFindings: Math.max(0, allFindings.length - shown.length),
  };
}
