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

## AI resume review (Phase 7)

`POST /api/resumes/:id/review` produces the review; `GET` reads one back. Both are
authenticated, and both scope every query by the caller's user id — the API holds the
service role key, so those filters are the ownership boundary and RLS is defence behind
them.

**The review is grounded in the file we hold, not in JSON from the browser.** The stored
original is downloaded, re-parsed and re-scored server-side before the model sees it. That
is slower than trusting a request body, and it is the only version that is honest: a review
has to describe the document the user actually uploaded, and a client-supplied resume would
let anyone spend an AI call on arbitrary text.

**Reviews are stored, and that is a cost control as much as a feature.** One call against a
free tier that allows ~20 a day is not something to spend twice on the same unchanged file,
so `resume_reviews` holds one row per file and the POST returns it untouched when it exists.
`?refresh=true` is the only path that spends another call, and it is always a deliberate
click. A per-user limit of 10 generations an hour keeps one enthusiastic re-analyser from
exhausting the day's budget for everyone else; reading an existing review is not limited.

**A failed review is never stored.** Caching a failure would make one bad minute permanent.
Quota exhaustion returns 429 and an outage 503, both worded so the user knows their score is
unaffected and the problem is ours and temporary.

**The review leads; the score follows.** `AiReview` sits at the top of the page with the
prioritised actions first, and the deterministic score is a single expandable line beneath
it (`ScorePanel`). A number tells you where you stand, the review tells you what to do, and
only one of those earns the top of the screen.

## Resume editor (Phase 8)

`resumes` + `resume_versions` arrive here rather than with the versioning UI in
Phase 11. The editor is the first thing that can change a user's resume, so the spec's
safety rule — keep the user original as the source-of-truth version — has to hold from this
point on. The parse is written twice at import: an immutable `original`, and the `draft` the
editor autosaves into. Building on a single mutable row would have meant migrating live user
data later.

No `resume_sections` table (the spec marks it optional). ResumeData is stored whole as
jsonb, so there is one canonical shape rather than rows reassembled into the domain model on
every read.

**A draft is allowed to be incomplete.** `resumeSchema` requires a name, an employer and a
job title; that is right for a resume about to be exported and wrong for one being written.
Clearing a field to retype it would fail validation mid-keystroke and lose the autosave, so
`resumeDraftSchema` relaxes the emptiness rules while keeping shape and size limits — those
bound both storage and the prompts this content later feeds. Completeness is enforced at
export, in Phase 16, where it actually matters.

**Concurrent edits are refused, not merged.** Every version row carries a `revision`, and a
save matches on it in the `WHERE` clause so the check and the write are one atomic statement.
Reading the revision first and then updating would leave a window for exactly the race the
column exists to prevent. A stale save returns 409 and the UI asks the user to reload; it
never retries, because retrying is how you overwrite whatever moved.

**TipTap edits, plain text is stored.** Headings, code blocks and quotes are disabled: that
structure belongs to the template, and offering it in a field means losing it at export.
Marks are stripped on the way out — `richText.ts` converts between ProseMirror JSON and
plain strings as pure, tested functions. Rich formatting inside resume content is an ATS
liability, and the scorer and prompts read strings either way. Undo/redo comes free with
ProseMirror's history.

The score is recomputed from the draft on every save and returned with it, so the number
always describes the text the server actually holds rather than the file once uploaded.

## AI editing (Phase 9)

`POST /api/editor/resumes/:id/rewrite` returns two or three options for a summary, a bullet,
a project or the skills grouping. **The route cannot write to the resume.** It reads the
draft for context and returns suggestions; applying one is a separate save the user
triggers. "Never overwrite the user's content automatically" is therefore a property of the
design rather than a promise in a comment, and there is a test asserting no write path
exists.

**Accepted AI text is marked as such.** A bullet taken from a suggestion is stored with
`source: 'ai'` and `verified: false` — the fields the domain model has always had for this —
and the editor shows an "AI · check this" badge until the user confirms it. Losing that
distinction is how somebody ends up defending an invented achievement in an interview.

**Options that need a missing fact are flagged, not hidden.** The prompt forbids inventing
detail, so a stronger line that would need a number the resume does not contain comes back
with `requiresVerification: true` and a placeholder. The panel marks it clearly and still
offers it: the user may well have the figure to hand, and withholding the suggestion would
be a worse answer than labelling it.

**Quota control.** One rewrite may be open at a time anywhere in the editor, so at most one
call is ever in flight. Identical text is answered from an in-memory cache (10 minutes,
200 entries, keyed by user and a hash of the text — resume content should not sit in a
process-wide map in readable form) so asking twice about something unchanged costs once. The
per-user limit is 20 an hour.

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
