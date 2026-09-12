import { randomUUID } from 'node:crypto';
import type { AtsCategoryResult, AtsScore, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { analyzeCompleteness } from './analyzers/completeness.js';
import { analyzeExperience } from './analyzers/experience.js';
import { analyzeFormatting } from './analyzers/formatting.js';
import { analyzeImpact } from './analyzers/impact.js';
import { analyzeKeywords } from './analyzers/keywords.js';
import { analyzeReadability } from './analyzers/readability.js';
import { analyzeSkills } from './analyzers/skills.js';
import { analyzeStructure } from './analyzers/structure.js';

const ANALYZERS = [
  analyzeStructure,
  analyzeSkills,
  analyzeExperience,
  analyzeImpact,
  analyzeKeywords,
  analyzeReadability,
  analyzeFormatting,
  analyzeCompleteness,
] as const;

export interface ScoreResumeOptions {
  resumeVersionId?: string;
}

/** Highest total a resume showing keyword-stuffing signals can reach. */
const STUFFING_CEILING = 55;

/**
 * Caps a resume that games keyword matching.
 *
 * Stuffing is cross-cutting: padding a skills list and repeating one term were
 * each penalised inside their own category, but the remaining categories could
 * still carry the total to a respectable number. A resume built to trick a
 * filter should not read as a good resume however tidy the rest of it is.
 */
function applyStuffingCeiling(weighted: number, categories: AtsCategoryResult[]): number {
  const STUFFING_SIGNALS = ['keywords.repetition', 'skills.too-many', 'skills.repetitive'];
  const signals = categories
    .flatMap((category) => category.findings)
    .filter((f) => STUFFING_SIGNALS.includes(f.id)).length;

  // One signal alone is weak evidence; both together is a pattern.
  const capped = signals >= 2 ? Math.min(weighted, STUFFING_CEILING) : weighted;
  return Math.round(capped);
}

/** Points deducted when a substantial career is described without a single outcome. */
const EXPECTATION_GAP_PENALTY = 9;

/**
 * Lowers a resume whose claimed experience is not matched by evidence.
 *
 * Expectations rise with a longer history; credit does not. Someone years into
 * a career listing only what they were assigned has undersold themselves more
 * than a graduate doing the same, and this is the one place that difference can
 * register — the impact category has already bottomed out at zero, so deducting
 * there would leave the finding cosmetic.
 *
 * The adjustment is deliberately downward. A score that rose with seniority
 * would reassure precisely the person whose resume is not landing interviews.
 */
function applyExpectationGap(score: number, categories: AtsCategoryResult[]): number {
  const flagged = categories
    .flatMap((category) => category.findings)
    .some((f) => f.id === 'impact.experience-without-evidence');

  return flagged ? Math.max(0, score - EXPECTATION_GAP_PENALTY) : score;
}

/**
 * Runs every category analyzer and combines them into the Resume Health score.
 *
 * Entirely deterministic: the same resume always yields the same score, and no
 * AI is involved. That is what makes the result explainable — every point is
 * traceable to a finding the user can read.
 *
 * This is an ATS-*style* score. It is not, and must never be presented as, the
 * score any particular vendor's system would produce.
 */
export function scoreResume(resume: Resume, options: ScoreResumeOptions = {}): AtsScore {
  const categories: AtsCategoryResult[] = ANALYZERS.map((analyze) => analyze(resume));

  /*
   * Categories that had nothing to judge are excluded rather than counted as
   * zero, and the remaining weights are renormalised so the score still reads
   * out of 100.
   *
   * Counting them as zero conflates "this resume is bad" with "we could not
   * read this resume". A CV whose bullets are drawn as vector glyphs, for
   * instance, is not a CV without achievements.
   */
  const assessed = categories.filter((category) => !category.notAssessed);
  const totalWeight = assessed.reduce((total, category) => total + category.weight, 0);

  const weighted =
    totalWeight > 0
      ? assessed.reduce((total, category) => total + category.score * category.weight, 0) /
        totalWeight
      : 0;

  const finalScore = applyExpectationGap(
    applyStuffingCeiling(weighted, categories),
    categories,
  );

  return {
    id: randomUUID(),
    resumeVersionId: options.resumeVersionId ?? '',
    finalScore,
    categories,
    createdAt: new Date().toISOString(),
  };
}

/** Weights must total 1 or the final score silently stops being a percentage. */
export function weightsAreValid(): boolean {
  const total = Object.values(ATS_CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  return Math.abs(total - 1) < 1e-9;
}
