import { z } from 'zod';
import { resumeSuggestionSchema } from './resume.js';

export const sectionReviewSchema = z.object({
  section: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
});

export const resumeAnalysisSchema = z.object({
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  sectionReviews: z.array(sectionReviewSchema),
  priorityActions: z.array(
    z.object({
      priority: z.enum(['high', 'medium', 'low']),
      action: z.string(),
      reason: z.string(),
    }),
  ),
});

export const rewriteOptionSchema = z.object({
  text: z.string().min(1),
  explanation: z.string(),
  requiresVerification: z.boolean(),
});

export const rewriteResultSchema = z.object({
  options: z.array(rewriteOptionSchema).min(1).max(3),
});

export const jobRequirementSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  category: z.enum(['skill', 'responsibility', 'qualification', 'keyword']),
  required: z.boolean(),
});

export const jobAnalysisSchema = z.object({
  id: z.string(),
  jobDescriptionId: z.string(),
  requirements: z.array(jobRequirementSchema),
  keywords: z.array(z.string()),
  createdAt: z.string(),
});

export const generateSuggestionsResultSchema = z.array(resumeSuggestionSchema);
