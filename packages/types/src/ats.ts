/**
 * ATS-style scoring model.
 * Source of truth: docs/CareerLens_AI_Master_Spec.docx, Section 10.
 */

export type AtsCategory =
  | 'atsCompatibility'
  | 'skillsQuality'
  | 'experienceStrength'
  | 'impactAchievements'
  | 'keywordQuality'
  | 'readability'
  | 'formatting'
  | 'professionalismCompleteness';

export interface AtsCategoryResult {
  category: AtsCategory;
  weight: number;
  score: number;
  findings: string[];
}

export interface AtsScore {
  id: string;
  resumeVersionId: string;
  finalScore: number;
  categories: AtsCategoryResult[];
  createdAt: string;
}

/**
 * Default category weights. Keep in one place so the scoring model
 * is easy to change and version (Section 10).
 */
export const ATS_CATEGORY_WEIGHTS: Record<AtsCategory, number> = {
  atsCompatibility: 0.15,
  skillsQuality: 0.15,
  experienceStrength: 0.15,
  impactAchievements: 0.15,
  keywordQuality: 0.1,
  readability: 0.1,
  formatting: 0.1,
  professionalismCompleteness: 0.1,
};
