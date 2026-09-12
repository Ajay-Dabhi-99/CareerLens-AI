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

## Access model: anonymous quick analysis vs. authenticated app

Two tiers (master spec, "Current Implementation Status" + Sections 3, 6, 9):

**Anonymous (public).** Upload → parse → deterministic ATS/Resume Health analysis → score
plus *limited basic findings* → TTL cleanup. No AI calls (cost and abuse control), no
persistence, no version history, no JD matching, no export.

**Authenticated.** Upload or import a temporary result → full AI analysis → detailed
suggestions → editor → AI rewrite → versions → optional JD → job match → tailored version
→ preview → export.

```
Public:   /  ·  /analyze  ·  /login  ·  /signup  ·  anonymous quick-analysis endpoints
Private:  /dashboard  ·  saved resumes  ·  detailed analysis  ·  editor
          versions  ·  job match  ·  export
```

Hard constraints:

- Anonymous quick analysis **never** creates a persistent user-owned `Resume` row. Temp
  state lives in `anonymous_analysis_sessions` (session id, temp parsed data/metrics,
  `created_at`, `expires_at`) and expires on its TTL.
- After authentication the temp session may be **explicitly imported** into the account —
  never silently.
- Public endpoints are explicitly scoped, strictly rate-limited, and cannot reach
  user-owned data. Anonymous session records are inaccessible outside their session token.
- Gated content must not be sent to an anonymous client at all. The UI shows locked
  *teasers* (`LockedFeature`) describing what an account unlocks — it never blurs real data
  that was shipped to the browser anyway.

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
strength 15%, **impact & achievements 20%**, keyword quality 10%, readability 10%,
**formatting 5%**, professionalism/completeness 10%. Weights live in one config module so
the model is easy to evolve and version.

Impact outweighs the presentation categories because quantified achievements are the
strongest measurable predictor of callbacks, while formatting consistency — real but
minor — was previously worth as much as impact.

**Analyzers score substance, not the absence of defects.** An earlier version started each
category at 100 and only deducted, so a resume with two throwaway bullets tripped no check
and scored full marks on experience, readability and formatting — 35% of the total awarded
for doing almost nothing. Experience now scales with how well roles are described, and
readability with whether bullets are long enough to carry an achievement.

**Projects substitute for employment** when there is no work history, capped at 70, so
graduates and career changers are judged on evidence they do have.

**Stuffing is capped across categories.** Padding a skills list and repeating one ecosystem
were each penalised locally, but the rest of a tidy resume could still carry the total. Two
or more stuffing signals now cap the final score at 55.

**Expectations scale with claimed experience; credit does not.** `estimateYearsOfExperience`
reads the role dates, and a history of three years or more described without a single
measurable outcome raises `impact.experience-without-evidence`, deducting 9 points from the
final score. The deduction lands on the total rather than inside the impact category because
such a resume has already scored zero there, which would make the finding cosmetic.

The direction is deliberate. A seniority *bonus* would have been the obvious symmetry, and
it is the wrong one: it would flatter a principal engineer whose resume reads as a job
description, which is precisely the person who needs telling. A twelve-year career written
without evidence now scores below a graduate's project work, because it communicates less.
The UI states the frame directly — the score measures how well the document conveys the
experience, not the experience itself.

Benchmarked against seven resumes spanning senior/quantified to unparseable, the usable
range widened from 61-97 to 19-93.

Implemented in `apps/api/src/services/ats/` — one pure analyzer per category, combined by
`scoreResume`. Every category returns a 0-100 score plus `AtsFinding[]`, each finding
carrying a stable `id` (such as `impact.no-metrics`) so tests and UI key off the
identifier rather than the wording.

The engine is fully deterministic and makes no AI calls: the same resume always produces
the same score, and every point is traceable to a finding the user can read. Findings
state what is missing; they never guess at what the missing value might have been.

**Free vs. gated.** `toPublicSummary` builds the anonymous view: the score and the full
per-category breakdown are returned (that is what the landing page promises), but only the
three most severe findings. The remainder are counted, not sent — withheld findings never
reach an anonymous client, so there is nothing recoverable from devtools.

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

`GeminiProvider` (`apps/api/src/services/ai/`) implements this behind the interface, and is
reached through `app.ai`. Every AI response is validated against the matching Zod schema in
`packages/validation/src/ai.ts` before it is trusted — the model is *asked* for a shape via
Gemini's `responseSchema`, but the reply is parsed and validated regardless.

**Prompt injection.** Uploaded resumes are attacker-controlled. The system instruction
declares the resume untrusted data and the content is fenced in explicit markers, so text
such as "ignore previous instructions" is reported as something odd the candidate wrote
rather than obeyed (verified against the live API). The deeper defence is structural: the
score comes from the deterministic engine, never the model, so even a successful injection
cannot change anyone's rating.

**Data minimisation.** `resumeForPrompt` sends only resume content — no row ids, no owning
user, no file metadata. Logs record the operation and error type, never resume text.

**Free-tier reality.** Quotas are per-model and small: `gemini-3.8-flash` allowed 20
requests *per day* during development, and 503 "high demand" responses were common across
every model. Retries are therefore load-bearing, and they distinguish three cases: server
congestion backs off exponentially with jitter, malformed output retries almost immediately
(waiting does not improve JSON validity), and quota exhaustion honours the API's stated
`retryDelay` or fails fast rather than spending more quota. `GEMINI_MODEL` is env-configurable
so a retirement or quota change is a config change, not a deploy.

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
