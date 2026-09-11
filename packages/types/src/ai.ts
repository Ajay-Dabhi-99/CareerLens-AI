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
import type { JobAnalysis, JobRequirement } from './job.js';
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
}
