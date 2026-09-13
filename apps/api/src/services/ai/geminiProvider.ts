import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type {
  AIProvider,
  JobAnalysis,
  JobAnalysisInput,
  ResumeAnalysis,
  ResumeAnalysisInput,
  RequirementMatchInput,
  RequirementVerdict,
  ResumeSuggestion,
  RewriteInput,
  RewriteResult,
  SuggestionInput,
} from '@career-lens-ai/types';
import { ATS_CATEGORY_LABELS } from '@career-lens-ai/types';
import {
  jobAnalysisSchema,
  resumeAnalysisSchema,
  rewriteResultSchema,
  generateSuggestionsResultSchema,
  requirementVerdictsSchema,
} from '@career-lens-ai/validation';
import { z } from 'zod';
import {
  analyzeResumePrompt,
  jobAnalysisPrompt,
  requirementMatchPrompt,
  resumeForPrompt,
  rewritePrompt,
  suggestionsPrompt,
  SYSTEM_INSTRUCTION,
} from './prompts.js';
import {
  jobAnalysisResponseSchema,
  requirementVerdictsResponseSchema,
  resumeAnalysisResponseSchema,
  rewriteResponseSchema,
  suggestionsResponseSchema,
} from './responseSchemas.js';

/**
 * Kept in step with what the API actually serves. gemini-2.5-flash was the
 * original choice and was withdrawn from new keys mid-build, which is why the
 * model is configurable rather than only a constant.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
/**
 * The free Gemini tier returns 503 "high demand" frequently — measured at
 * roughly one in three calls during development, across every model. Retries
 * are therefore load-bearing rather than a nicety, and the backoff is longer
 * than a typical transient-error policy would need.
 */
const MAX_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 800;
/** Jitter stops concurrent uploads retrying in lockstep and re-colliding. */
const RETRY_JITTER_MS = 250;
/**
 * Malformed output is retried almost immediately. Backing off does not make the
 * model more likely to produce valid JSON next time — the long waits above exist
 * to let a congested server recover, which is a different problem.
 */
const MALFORMED_RESPONSE_RETRY_MS = 150;

export class AIResponseError extends Error {
  /** Named `detail` rather than `cause` so it does not shadow Error.cause. */
  readonly detail?: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = 'AIResponseError';
    this.detail = detail;
  }
}

/** Minimal logger contract so the provider is testable without Fastify. */
export interface AiLogger {
  warn: (details: Record<string, unknown>, message: string) => void;
  error: (details: Record<string, unknown>, message: string) => void;
}

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  logger?: AiLogger;
  /** Injectable for tests; defaults to the real SDK. */
  generate?: GenerateFn;
}

export interface GenerateArgs {
  model: string;
  prompt: string;
  responseSchema: unknown;
}

export type GenerateFn = (args: GenerateArgs) => Promise<string>;

const noopLogger: AiLogger = { warn: () => {}, error: () => {} };

/** Longest we will hold a request open waiting for quota to free up. */
const MAX_QUOTA_WAIT_MS = 8000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isQuotaExhausted(error: unknown): boolean {
  return /429|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(errorText(error));
}

/**
 * Gemini reports how long to wait before retrying a quota error. Honouring it
 * matters: the free tier allows only a handful of requests per minute, so
 * retrying sooner consumes more quota and pushes the reset further away.
 */
function quotaRetryDelayMs(error: unknown): number | null {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"|retry in (\d+(?:\.\d+)?)s/i.exec(
    errorText(error),
  );
  const seconds = match?.[1] ?? match?.[2];
  return seconds ? Math.ceil(Number(seconds) * 1000) : null;
}

function isTransient(error: unknown): boolean {
  // Server-side congestion and network faults; a repeat may well succeed.
  return /503|502|504|timeout|ETIMEDOUT|ECONNRESET|overloaded|unavailable/i.test(errorText(error));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Gemini and validates the result.
 *
 * Nothing reaches the caller unvalidated: the model is asked for a shape, and
 * the reply is then parsed with Zod regardless. A malformed response is retried
 * and ultimately rejected rather than passed downstream, because bad structured
 * data is harder to notice than an outright failure.
 *
 * Logs record what failed and never the resume content itself.
 */
async function callAndValidate<T>(
  generate: GenerateFn,
  logger: AiLogger,
  operation: string,
  args: GenerateArgs,
  schema: z.ZodType<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await generate(args);

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch (error) {
        throw new AIResponseError(`${operation}: response was not valid JSON`, error);
      }

      const validated = schema.safeParse(parsedJson);
      if (!validated.success) {
        throw new AIResponseError(
          `${operation}: response did not match the expected schema`,
          validated.error.issues.map((issue) => issue.path.join('.')),
        );
      }

      return validated.data;
    } catch (error) {
      lastError = error;

      if (attempt === MAX_ATTEMPTS) break;

      let waitMs: number;

      if (isQuotaExhausted(error)) {
        const stated = quotaRetryDelayMs(error);
        // Waiting longer than a request should stay open helps nobody: fail now
        // so the caller can degrade, rather than holding the connection and
        // burning more quota on a retry that is destined to fail too.
        if (stated === null || stated > MAX_QUOTA_WAIT_MS) {
          logger.warn(
            { operation, attempt, retryAfterMs: stated },
            'AI quota exhausted, not retrying',
          );
          break;
        }
        waitMs = stated;
      } else if (error instanceof AIResponseError) {
        waitMs = MALFORMED_RESPONSE_RETRY_MS;
      } else if (isTransient(error)) {
        waitMs = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1) + Math.random() * RETRY_JITTER_MS;
      } else {
        // Anything else (bad key, bad request) will fail identically on a repeat.
        break;
      }

      logger.warn(
        { operation, attempt, reason: error instanceof Error ? error.name : 'unknown' },
        `AI call failed, retrying (${attempt}/${MAX_ATTEMPTS})`,
      );
      await delay(waitMs);
    }
  }

  logger.error(
    { operation, attempts: MAX_ATTEMPTS, reason: lastError instanceof Error ? lastError.message : 'unknown' },
    'AI call failed',
  );
  throw lastError instanceof Error
    ? lastError
    : new AIResponseError(`${operation}: failed`, lastError);
}

function defaultGenerate(apiKey: string): GenerateFn {
  const client = new GoogleGenAI({ apiKey });

  return async ({ model, prompt, responseSchema }) => {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: responseSchema as never,
        temperature: 0.3,
      },
    });

    const text = response.text;
    if (!text) throw new AIResponseError('Gemini returned an empty response');
    return text;
  };
}

/**
 * Gemini implementation of the AIProvider contract.
 *
 * Callers depend on AIProvider, never on this class or the SDK, so the provider
 * can be swapped or stubbed without touching route code.
 */
export function createGeminiProvider(options: GeminiProviderOptions): AIProvider {
  const model = options.model ?? DEFAULT_MODEL;
  const logger = options.logger ?? noopLogger;
  const generate = options.generate ?? defaultGenerate(options.apiKey);

  return {
    async analyzeResume(input: ResumeAnalysisInput): Promise<ResumeAnalysis> {
      const categoryNotes = input.atsCategories.map(
        (category) => `${ATS_CATEGORY_LABELS[category.category]}: ${category.score}/100`,
      );

      return callAndValidate(
        generate,
        logger,
        'analyzeResume',
        {
          model,
          prompt: analyzeResumePrompt(input.resume, categoryNotes),
          responseSchema: resumeAnalysisResponseSchema,
        },
        resumeAnalysisSchema,
      );
    },

    async rewriteSection(input: RewriteInput): Promise<RewriteResult> {
      return callAndValidate(
        generate,
        logger,
        'rewriteSection',
        {
          model,
          prompt: rewritePrompt(
            input.target,
            input.currentText,
            input.context as never,
            input.jobRequirements?.map((requirement) => requirement.text),
          ),
          responseSchema: rewriteResponseSchema,
        },
        rewriteResultSchema,
      );
    },

    async analyzeJob(input: JobAnalysisInput): Promise<JobAnalysis> {
      // The model returns requirements and keywords; identifiers and timestamps
      // are ours to assign, not the model's to invent.
      const bare = await callAndValidate(
        generate,
        logger,
        'analyzeJob',
        {
          model,
          prompt: jobAnalysisPrompt(input.rawJobDescriptionText),
          responseSchema: jobAnalysisResponseSchema,
        },
        z.object({
          requirements: z.array(
            z.object({
              text: z.string().min(1),
              category: z.enum(['skill', 'responsibility', 'qualification', 'keyword']),
              required: z.boolean(),
            }),
          ),
          keywords: z.array(z.string()),
        }),
      );

      const analysis: JobAnalysis = {
        id: randomUUID(),
        jobDescriptionId: '',
        requirements: bare.requirements.map((requirement) => ({
          id: randomUUID(),
          ...requirement,
        })),
        keywords: bare.keywords,
        createdAt: new Date().toISOString(),
      };

      const validated = jobAnalysisSchema.safeParse(analysis);
      if (!validated.success) {
        throw new AIResponseError('analyzeJob: assembled analysis failed validation');
      }
      return analysis;
    },

    /**
     * Judges requirements a keyword lookup could not settle.
     *
     * Evidence is checked against the resume before it is returned. The prompt
     * requires a verbatim quote, but a prompt is a request and this is the one
     * place where a fabricated quote would do real damage: a "matched" verdict
     * backed by a line the resume does not contain would send someone into an
     * interview believing their CV says something it does not. A verdict whose
     * evidence cannot be found is demoted to needsVerification and the quote
     * dropped, so the claim survives only as a prompt for the user to check.
     */
    async matchRequirements(input: RequirementMatchInput): Promise<RequirementVerdict[]> {
      if (input.requirements.length === 0) return [];

      const { verdicts } = await callAndValidate(
        generate,
        logger,
        'matchRequirements',
        {
          model,
          prompt: requirementMatchPrompt(
            input.resume,
            input.requirements.map((requirement) => requirement.text),
          ),
          responseSchema: requirementVerdictsResponseSchema,
        },
        requirementVerdictsSchema,
      );

      const corpus = resumeForPrompt(input.resume).toLowerCase();
      const known = new Set(input.requirements.map((requirement) => requirement.id));

      return verdicts
        // A verdict on a requirement nobody asked about cannot be placed.
        .filter((verdict) => known.has(verdict.requirementId))
        .map((verdict) => {
          const quote = verdict.evidence?.trim();
          const quoted = Boolean(quote) && corpus.includes(quote!.toLowerCase());

          if (quote && !quoted) {
            logger.warn(
              { operation: 'matchRequirements', requirementId: verdict.requirementId },
              'Discarded evidence that does not appear in the resume',
            );

            return {
              requirementId: verdict.requirementId,
              state: 'needsVerification' as const,
              confidence: Math.min(verdict.confidence, 0.5),
            };
          }

          // Without a quote, "matched" is an assertion rather than a finding.
          const state =
            verdict.state === 'matched' && !quoted ? ('needsVerification' as const) : verdict.state;

          return { ...verdict, state, evidence: quoted ? quote : undefined };
        });
    },

    async generateSuggestions(input: SuggestionInput): Promise<ResumeSuggestion[]> {
      const bare = await callAndValidate(
        generate,
        logger,
        'generateSuggestions',
        {
          model,
          prompt: suggestionsPrompt(
            input.resume,
            input.jobRequirements?.map((requirement) => requirement.text),
          ),
          responseSchema: suggestionsResponseSchema,
        },
        z.object({
          suggestions: z.array(
            z.object({
              section: z.string(),
              priority: z.enum(['high', 'medium', 'low']),
              issue: z.string(),
              whyItMatters: z.string(),
              originalText: z.string().optional(),
              suggestedText: z.string().optional(),
              requiresVerification: z.boolean(),
              confidence: z.number().min(0).max(1),
            }),
          ),
        }),
      );

      const suggestions: ResumeSuggestion[] = bare.suggestions.map((suggestion) => ({
        id: randomUUID(),
        ...suggestion,
      }));

      const validated = generateSuggestionsResultSchema.safeParse(suggestions);
      if (!validated.success) {
        throw new AIResponseError('generateSuggestions: assembled suggestions failed validation');
      }
      return suggestions;
    },
  };
}
