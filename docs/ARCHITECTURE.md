# Architecture

Condensed from `docs/CareerLens_AI_Master_Spec.docx`. That document is the source of truth;
this file is a quick-reference summary for day-to-day development.

> **Provider note (2026-09-11):** the master spec's AI examples are written against
> "Claude" — that refers to Claude Code, the assistant building this project, not a runtime
> dependency. The in-app AI provider is **Gemini** (Google AI Studio), chosen for its free
> tier and native structured-output support. Read "Claude API" / "ClaudeProvider" below as
> "Gemini API" / "GeminiProvider" — the `AIProvider` interface is what the code actually
> depends on, and it is provider-agnostic.

## System shape

```
React Web App (apps/web)
        |  HTTPS / REST
        v
Node.js + Fastify API (apps/api)
        |
        +-- Resume module      (upload, parsing, structured ResumeData)
        +-- ATS module         (deterministic scoring engine)
        +-- AI module          --> Gemini API (via AIProvider)
        +-- Job Match module   (JD parsing + matching)
        +-- Version module     (version history, restore, compare)
        +-- Export module      (PDF/DOCX generation)
        |
        +-- Supabase PostgreSQL (persistent data)
        +-- Supabase Storage    (original files + generated artifacts)
        +-- Supabase Auth       (email + Google)
```

Business logic must not live inside React page components — it belongs in backend
modules/services or in shared pure functions in `packages/`.

## Hybrid AI architecture

Deterministic code handles measurable mechanics (file validation, parsing/normalization,
ATS structural checks, weighted score calculation, exact/known keyword matching, final
export). Gemini handles contextual reasoning: pros/cons, bullet-quality reasoning, summary
rewrites, job-requirement extraction, semantic matching. See Section 7 of the master spec
for the full concern-by-concern table.

The product must never claim to produce the exact score used by any ATS vendor — call it
an "ATS-style compatibility" or "Resume Health" score and explain the scoring model.

## Authentication (Phase 2)

Supabase Auth issues the session; the browser holds it via `@supabase/supabase-js`
(`apps/web/src/lib/supabase.ts`, anon key only). `AuthProvider`
(`apps/web/src/features/auth/`) exposes session state and subscribes to
`onAuthStateChange`; `ProtectedRoute` gates every private route.

For calls to our own API, the frontend attaches the Supabase access token as
`Authorization: Bearer <token>` (`apps/web/src/lib/api.ts` → `authedFetch`). On the
backend, `registerAuth` (`apps/api/src/modules/auth/`) adds an `app.requireAuth`
preHandler that verifies the token through the `AuthVerifier` interface — implemented by
Supabase, injectable in tests so auth is testable with no live project. **Every private
route must use `requireAuth`**, and must additionally enforce row ownership in its
queries; authentication alone is not authorization.

The service role key stays server-side only (`apps/api/.env`) and bypasses RLS — use it
only after the route has established who is calling.

**Google Sign-In is deliberately deferred** (decided 2026-09-11): it needs a Google Cloud
Console OAuth client wired into Supabase's Google provider. Email/password is the working
path until that external setup is done; adding Google later is a Supabase dashboard change
plus a `signInWithOAuth({ provider: 'google' })` button, no architecture change.

## Canonical domain model

Defined in `packages/types/src/resume.ts`, `ats.ts`, `job.ts`, `ai.ts`. Mirrored as Zod
schemas in `packages/validation`. Key types: `Resume`, `ResumeBullet`, `ResumeSuggestion`,
`ResumeVersion`, `AtsScore`, `JobDescription`, `JobAnalysis`, `SkillMatch`, `AIProvider`.

## ATS scoring model

Transparent weighted categories (see `packages/types/src/ats.ts` for
`ATS_CATEGORY_WEIGHTS`): ATS compatibility/structure 15%, skills quality 15%, experience
strength 15%, impact & achievements 15%, keyword quality 10%, readability 10%, formatting
10%, professionalism/completeness 10%. `finalScore = sum(categoryScore * categoryWeight)`.
Weights live in one config module so the model is easy to evolve and version.

## Gemini AI contract

The `AIProvider` interface (`packages/types/src/ai.ts`) is the only way business logic or
the frontend touches AI behavior:

```ts
interface AIProvider {
  analyzeResume(input: ResumeAnalysisInput): Promise<ResumeAnalysis>;
  rewriteSection(input: RewriteInput): Promise<RewriteResult>;
  analyzeJob(input: JobAnalysisInput): Promise<JobAnalysis>;
  generateSuggestions(input: SuggestionInput): Promise<ResumeSuggestion[]>;
}
```

`GeminiProvider` (added in Phase 6) implements this behind the interface. Every AI response
must be validated against the matching Zod schema in `packages/validation/src/ai.ts` before
it is trusted.

## Versioning model

A canonical master resume with derived versions (original, AI-improved, job-tailored per
JD). Users can compare any two versions, restore one as the current working copy, and
download a selected version. Job-targeted optimization always creates a new version rather
than overwriting the master resume.

## Build order

FOUNDATION -> UI -> AUTH -> UPLOAD -> PARSER -> ATS -> GEMINI -> AI REVIEW -> EDITOR ->
AI EDITING -> DIFF -> VERSIONING -> OPTIONAL JD -> JOB MATCH -> TAILORING -> TEMPLATES ->
EXPORT -> QUALITY -> TESTING -> DEPLOYMENT

Full phase table with Definition of Done for each phase: Section 20 of the master spec.

## Non-goals for V1

- No job marketplace, no auto-apply.
- No claim of matching any specific ATS vendor's exact score.
- Job Description is never required.
- No silent rewrites of user content.
- No RAG/embeddings before the core pipeline (V1/V2) is stable — that's V3 scope.
