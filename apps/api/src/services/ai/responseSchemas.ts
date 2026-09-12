import { Type } from '@google/genai';

/**
 * Schemas handed to Gemini so it returns JSON of a known shape.
 *
 * These constrain the model; they are not a substitute for validation. Every
 * response is still parsed through Zod before anything downstream trusts it —
 * a schema tells the model what to aim for, it does not guarantee the hit.
 */

export const resumeAnalysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    pros: { type: Type.ARRAY, items: { type: Type.STRING } },
    cons: { type: Type.ARRAY, items: { type: Type.STRING } },
    sectionReviews: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['section', 'strengths', 'weaknesses'],
      },
    },
    priorityActions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          action: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['priority', 'action', 'reason'],
      },
    },
  },
  required: ['pros', 'cons', 'sectionReviews', 'priorityActions'],
} as const;

export const rewriteResponseSchema = {
  type: Type.OBJECT,
  properties: {
    options: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          explanation: { type: Type.STRING },
          requiresVerification: { type: Type.BOOLEAN },
        },
        required: ['text', 'explanation', 'requiresVerification'],
      },
    },
  },
  required: ['options'],
} as const;

export const jobAnalysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    requirements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: ['skill', 'responsibility', 'qualification', 'keyword'],
          },
          required: { type: Type.BOOLEAN },
        },
        required: ['text', 'category', 'required'],
      },
    },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['requirements', 'keywords'],
} as const;

export const suggestionsResponseSchema = {
  type: Type.OBJECT,
  properties: {
    suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          issue: { type: Type.STRING },
          whyItMatters: { type: Type.STRING },
          originalText: { type: Type.STRING },
          suggestedText: { type: Type.STRING },
          requiresVerification: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER },
        },
        required: ['section', 'priority', 'issue', 'whyItMatters', 'requiresVerification', 'confidence'],
      },
    },
  },
  required: ['suggestions'],
} as const;
