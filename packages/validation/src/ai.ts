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

/**
 * Verdicts on requirements a keyword lookup could not settle.
 *
 * Validated like every other AI response before anything downstream trusts it:
 * the model is asked for a shape, and the reply is parsed regardless.
 */
export const requirementVerdictSchema = z.object({
  requirementId: z.string().min(1),
  state: z.enum(['matched', 'partial', 'missing', 'needsVerification']),
  evidence: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const requirementVerdictsSchema = z.object({
  verdicts: z.array(requirementVerdictSchema),
});
