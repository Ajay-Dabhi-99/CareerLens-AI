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

  const finalScore =
    totalWeight > 0
      ? Math.round(
          assessed.reduce((total, category) => total + category.score * category.weight, 0) /
            totalWeight,
        )
      : 0;

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
