/**
 * Job description and job-match domain model.
 * Source of truth: docs/CareerLens_AI_Master_Spec.docx, Sections 9 & 16.
 */

export interface JobDescription {
  id: string;
  userId: string;
  rawText: string;
  title?: string;
  company?: string;
  createdAt: string;
}

export interface JobRequirement {
  id: string;
  text: string;
  category: 'skill' | 'responsibility' | 'qualification' | 'keyword';
  required: boolean;
}

export interface JobAnalysis {
  id: string;
  jobDescriptionId: string;
  requirements: JobRequirement[];
  keywords: string[];
  createdAt: string;
}

export type MatchState = 'matched' | 'partial' | 'missing' | 'needsVerification';

export interface SkillMatch {
  id: string;
  requirementId: string;
  state: MatchState;
  evidence?: string;
  confidence: number;
}

export interface JobMatchResult {
  id: string;
  resumeVersionId: string;
  jobAnalysisId: string;
  matchScore: number;
  matches: SkillMatch[];
  createdAt: string;
}
