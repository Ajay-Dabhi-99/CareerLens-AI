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

export type AtsFindingSeverity = 'good' | 'warning' | 'critical';

export interface AtsFinding {
  /**
   * Stable identifier such as `impact.no-metrics`. Tests and the UI key off this
   * rather than the wording, so copy can change without breaking either.
   */
  id: string;
  severity: AtsFindingSeverity;
  message: string;
}

export interface AtsCategoryResult {
  category: AtsCategory;
  weight: number;
  /** 0-100. The single convention across every analyzer. */
  score: number;
  findings: AtsFinding[];
  /**
   * True when the resume contained nothing this category could judge.
   *
   * Scoring such a category 0 would blame the candidate for an absence of
   * evidence — often our own parsing limitation rather than a flaw in their
   * resume. Unassessed categories are excluded from the weighted total and the
   * remaining weights are renormalised.
   */
  notAssessed?: boolean;
}

export interface AtsScore {
  id: string;
  resumeVersionId: string;
  /** 0-100, the weighted sum of the category scores. */
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
  // Quantified achievements are the strongest measurable predictor of callbacks,
  // so impact carries more than the presentation categories below it.
  impactAchievements: 0.2,
  keywordQuality: 0.1,
  readability: 0.1,
  // Consistency matters, but far less than what the bullets actually say.
  formatting: 0.05,
  professionalismCompleteness: 0.1,
};

/** Human-readable labels, so the API and UI cannot drift apart. */
export const ATS_CATEGORY_LABELS: Record<AtsCategory, string> = {
  atsCompatibility: 'Structure',
  skillsQuality: 'Skills',
  experienceStrength: 'Experience',
  impactAchievements: 'Impact',
  keywordQuality: 'Keywords',
  readability: 'Readability',
  formatting: 'Formatting',
  professionalismCompleteness: 'Completeness',
};
