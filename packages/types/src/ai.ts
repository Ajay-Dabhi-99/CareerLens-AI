/**
 * AI provider contract (implemented by GeminiProvider — see Section 11 of the master
 * spec, which describes this contract against Claude; the project uses Gemini instead,
 * see docs/ARCHITECTURE.md).
 *
 * The UI and business modules must depend on this AIProvider interface,
 * never directly on the Gemini SDK. All responses must be structured
 * and validated (see @career-lens-ai/validation) before touching the database.
 */

import type { Resume, ResumeSuggestion, SuggestionPriority } from './resume.js';
import type { JobAnalysis, JobRequirement, MatchState } from './job.js';
import type { AtsCategoryResult } from './ats.js';

export interface ResumeAnalysisInput {
  resume: Resume;
  atsCategories: AtsCategoryResult[];
}

export interface SectionReview {
  section: string;
  strengths: string[];
  weaknesses: string[];
}

export interface ResumeAnalysis {
  pros: string[];
  cons: string[];
  sectionReviews: SectionReview[];
  priorityActions: Array<{ priority: SuggestionPriority; action: string; reason: string }>;
}

export interface RewriteInput {
  target: 'summary' | 'bullet' | 'project' | 'skills';
  currentText: string;
  context: Partial<Resume>;
  jobRequirements?: JobRequirement[];
}

export interface RewriteOption {
  text: string;
  explanation: string;
  requiresVerification: boolean;
}

export interface RewriteResult {
  options: RewriteOption[];
}

/**
 * Requirements a keyword lookup could not settle, sent for judgement.
 *
 * Only the unresolved ones travel: what could be decided by looking already
 * was, so the model spends its attention — and the quota — on the cases that
 * genuinely need reading.
 */
export interface RequirementMatchInput {
  resume: Resume;
  requirements: JobRequirement[];
}

export interface RequirementVerdict {
  requirementId: string;
  state: MatchState;
  /**
   * A verbatim line from the resume. The caller checks it really appears there
   * before showing it, because evidence is the whole basis for trusting a
   * verdict and an invented quote would be worse than no verdict at all.
   */
  evidence?: string;
  confidence: number;
}

export interface TailoringInput {
  resume: Resume;
  /** Shown to the model so suggestions name the role they are aimed at. */
  role: string;
  /**
   * How the resume currently matches, so the model works on what is weakly
   * evidenced rather than guessing what the posting wants.
   */
  gaps: Array<{ requirement: string; state: MatchState; evidence?: string }>;
}

export interface JobAnalysisInput {
  rawJobDescriptionText: string;
}

export interface SuggestionInput {
  resume: Resume;
  jobRequirements?: JobRequirement[];
}

export interface AIProvider {
  analyzeResume(input: ResumeAnalysisInput): Promise<ResumeAnalysis>;
  rewriteSection(input: RewriteInput): Promise<RewriteResult>;
  analyzeJob(input: JobAnalysisInput): Promise<JobAnalysis>;
  generateSuggestions(input: SuggestionInput): Promise<ResumeSuggestion[]>;
  matchRequirements(input: RequirementMatchInput): Promise<RequirementVerdict[]>;
  suggestTailoring(input: TailoringInput): Promise<ResumeSuggestion[]>;
}
