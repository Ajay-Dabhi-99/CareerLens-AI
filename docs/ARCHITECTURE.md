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

## Diff and approval (Phase 10)

The phase's Definition of Done is "every AI change is reversible". Undo in the editor lives
in browser memory, so reloading the page made an accepted rewrite permanent. `ai_changes`
records one row per accepted suggestion — the text as it was, as it became, and whether the
user edited it first — so the guarantee holds tomorrow as well as this afternoon.

**Three ways out of a suggestion, and they are not the same.** Accept takes it, Edit opens it
as a starting point, Reject leaves it. The middle one matters most: a suggestion is usually
nearly right, and without it the choice collapses into "accept wording you half-agree with"
or "lose it entirely". The history records which, so "took the AI's words" stays
distinguishable from "used them as a starting point".

**The diff is word-level and written here rather than pulled in.** It is one small algorithm
on short strings; a dependency would be more code to audit than the thirty lines it replaces.
Words, not characters: a character diff of a rewritten sentence produces fragments
highlighted inside words, which is harder to read than no diff at all. Tests assert both
sides reconstruct exactly, because a diff that cannot rebuild its own input is lying about
one of them.

**Reverting is refused rather than guessed at.** It matches the exact text the user accepted.
If they have since rewritten that line themselves, the text is not found and nothing is
touched — overwriting someone's later work in the name of undoing an earlier change is the
opposite of what they asked for. The revert happens on the server so the read, the edit and
the save are one operation against the revision the draft actually holds; doing it in the
browser would race with autosave.

**Recording is separate from saving.** The accepted text reaches the resume through the
ordinary autosave, so a failure to write history costs the ability to revert that one change
from the list and never the edit itself.

## Version history (Phase 11)

Phase 8 built the versioned schema; this phase adds the 'snapshot' label, because none of
the four existing ones honestly described "a working state the user chose to keep", and the
UI for history, compare and restore.

**Every version is scored on read, never stored.** A stored score goes stale the moment the
scoring model changes, and comparing two versions scored by different models would be
meaningless. Scoring is deterministic and costs nothing, so it is recomputed.

**Restoring keeps the current work first, automatically.** Restoring replaces everything the
user has been editing, and the click before it is a confirmation rather than a preview.
"Manage resume variants safely" cannot coexist with an action that loses an afternoon's
work, so the draft is snapshotted before it is overwritten and the response names where it
went — the user is told, not asked to trust.

**The original and the draft cannot be deleted.** The filter lives in the repository query,
not only in the UI: the original is what every restore goes back to, and the draft is what
the editor is writing into. Losing either would break the guarantee that any change can be
undone.

**Comparison follows the shape of a resume.** Two whole documents diffed as one blob produce
something nobody reads, so `sectionsOf` flattens each version into named sections and only
those that actually differ are shown, each labelled after the thing it describes
("Engineer at Acme", not "experience-0"). A section present on one side only is described in
words rather than diffed against nothing.

## Optional job description (Phase 12)

`job_descriptions` holds the posting verbatim and `job_analyses` holds the requirements
extracted from it. The analysis is derived and can be regenerated; the source text cannot, so
it is kept exactly as given.

**"Optional" is structural, not a rule to remember.** Nothing else in the schema references
these tables and no other route reads them, so skipping a job description cannot block
analysis, editing or export — there is no code path through which it could. A test asserts
the other routes work without one. The Skip action is a real link out of the page, not a
disabled-looking control.

**A posting is untrusted text from an unknown source.** It reaches the model only as fenced
data under the system instruction, and `analyzeJob` receives nothing but the text — no
resume, no score, no write path. A posting containing "ignore previous instructions" can
therefore produce, at worst, a wrong list of requirements.

**Uploads are stored as text, not as files.** Unlike a resume there is no reason to keep the
original bytes of a posting, and what is not stored does not have to be protected. Magic-byte
validation still applies: a declared MIME type is a claim by the caller.

**One extraction per posting.** The source text never changes, so a second call would spend
quota to learn the same thing; the analysis is stored and returned unchanged thereafter. A
failed extraction never loses the posting, so nothing has to be re-pasted.

## Job match (Phase 13)

Two passes, in the order the spec's hybrid table sets out.

**A keyword lookup settles what can be settled by looking.** A requirement naming a specific
technology either appears in the resume or it does not, and that is a lookup rather than a
judgement: explainable, identical every time, and free. Terms are matched whole-word across
the whole resume, with the strongest single line quoted as evidence.

Two rules earn their keep there. Filler is stripped, so "Strong experience with Go" matches
on Go rather than on "experience". And a hit made only of *generic* words does not count:
"Rust systems programming" finding the word "systems" in "payment systems" would otherwise
report partial Rust experience to someone who has none.

**Only what is left goes to the model**, which can recognise a requirement described in
different words — "experience leading teams" against a resume that says "Led the ledger
migration". That is the case a keyword search cannot reach, and it is the only thing the
quota is spent on.

**Evidence is verified before it is shown.** The prompt requires a verbatim quote, but a
prompt is a request. A verdict whose evidence does not appear in the resume is demoted to
`needsVerification` and the quote dropped: a "matched" backed by an invented line would send
someone into an interview believing their CV says something it does not. A `matched` with no
quote at all is demoted the same way.

**The score is computed here, never by the model**, exactly as with the resume score. Matched
counts 1, partial 0.5, needsVerification 0.25 and missing 0, weighted double for requirements
the posting calls essential. `needsVerification` earns a little rather than nothing because
scoring our own uncertainty as zero would penalise the candidate for our limits.

**When the AI half fails the deterministic half still stands.** Unjudged requirements are
reported as needing verification rather than missing: we did not look, and "missing" is a
claim we would not have earned.

**"Missing" describes the document, not the person.** The UI says so in those words, because
the difference between "your resume does not show this" and "you cannot do this" is the whole
difference between useful advice and an insult.

## Tailored resumes (Phase 14)

No migration: `resume_versions` already carries the `job-tailored` label, so a tailored
resume is a version like any other.

**Tailoring means emphasis, never addition.** This is the phase where a model is most tempted
to invent, because the gaps are named for it — and closing one by adding a skill would be
writing a lie the user has to defend in an interview. The prompt says so in those words, and
tells it what to do about a requirement the resume genuinely does not meet: leave it alone.

**The suggestion route cannot write.** As with rewriting, creating the tailored version is a
separate request carrying the text the user approved, so "tailor without damaging the master
resume" is a property of the design rather than a promise. A test asserts no write path
exists.

**Only the gaps are sent.** Requirements the match already settled as `matched` are excluded:
they need no tailoring, and including them would spend the model's attention on finished
work. When nothing is unmatched, the route answers without an AI call at all.

**The tailored version is a sibling.** It is written alongside the draft and the original,
never over either, and named after the posting — so a resume tailored for one job cannot
quietly become the one sent to another.

**Applying is exact-match and skips rather than guesses.** A suggestion whose original text is
no longer in the resume is counted as skipped and reported: the user may have edited that line
since, and replacing the wrong thing on a resume is worse than leaving a suggestion unapplied.
Rewritten bullets keep `source: 'ai'` so tailoring does not launder AI wording into text that
looks reviewed.

## Templates (Phase 15)

Modern, Minimal, Professional, Technical and Executive, from the spec. No migration: the choice
is stored in `metadata.templateId` on the draft, which the types and the draft validator
already carried, so it travels with the resume into versions and export.

**Five style objects, one renderer.** `ResumeDocument` renders every template; a template is a
`TemplateStyle` — typography, spacing, heading treatment and, above all, section order.
Five components would have been five places to forget an empty-section check or format a date
differently, and the templates would drift into disagreeing about what the resume *says*.
Shared rules (date ranges, contact line, which sections have content) live once in
`templates/lib/format.ts`. A parameterised test asserts every template renders identical
content.

**Every template is single-column, with document order as reading order.** Multi-column
resumes look good and parse badly: filters read text in document order, and a sidebar
interleaves with the main column. Templates vary emphasis through order instead — Technical
puts skills ahead of experience, Executive leads with the summary and long roles. A test
asserts each template's headings appear in its declared order.

**Empty sections print nothing.** A heading over an empty row reads as a gap the candidate
forgot to fill, so a section counts as present only when it has real content, not merely a
row with blank fields.

**Colours are fixed, not themed.** A resume is printed on white paper whether or not its
author prefers dark mode.

**Unchecked AI lines are marked in preview and never in print.** Preview is the last point at
which the user reads the resume before it leaves, so an unverified AI-written bullet is
highlighted there; a marker on the exported document would mean nothing to the reader.

**The A4 preview scales the page, not the text.** Content is laid out at true A4 width and the
whole sheet is scaled to fit, so line wrapping on screen is line wrapping on paper. Page breaks
are drawn where they will fall, because three lines spilling onto page two is one of the most
fixable problems a resume has and one of the least visible without it.

## Export (Phase 16)

**The file is built from the stored version, not from the browser.** Both the audit and the
DOCX route read the chosen version from the database, so "the downloaded file matches the
selected version" is true by construction: there is no way to export text that was never
saved. Any version can be exported — a tailored one is usually what gets sent.

**What a template decides is shared.** Section order, skills layout, the empty-section rule and
date formatting moved into `packages/types/src/templates.ts`, and both the web preview and the
DOCX exporter read them. Two copies would eventually disagree, and the file a user downloads
would list sections in a different order from the page they approved. Only the *look* — fonts,
sizes, heading treatment — is decided separately, because Word and CSS express it differently.

**DOCX is generated from structured data** with the `docx` library, as the spec requires: every
word is real, editable text a parser can read. Bullets use real list numbering rather than typed
characters, which break when a recruiter edits the list. A test unzips the file and asserts the
section order follows the template.

**PDF is the browser's print-to-PDF of the exact preview component.** It produces selectable
text from the same `ResumeDocument` the user approved, in print mode so AI markers are absent.
A separate PDF renderer would be one more thing that could lay the resume out differently. The
print stylesheet removes, rather than hides, everything but the print root — hidden elements
still take up space and would add blank pages. The trade-off is honest: the user picks
"Save as PDF" in the print dialog rather than getting a direct download.

**Completeness is enforced here, and only here.** Drafts may be incomplete so autosave never
fails mid-edit; `auditForExport` is where that is paid for. Deterministic, no model.

- *Blocking:* no name; no email or phone; nothing to export; and any square-bracketed
  placeholder or filler text. The last one is the backstop for our own safety mechanism — the
  rewrite feature deliberately leaves "[X]%" when a stronger line needs a number the resume
  does not contain, and that must never reach an employer.
- *Warning:* unchecked AI-written lines, roles without dates or titles, no summary. Shown by
  location so each is checked individually; the user may stand behind them, so export proceeds.

**The server enforces the audit too.** The DOCX route refuses with 422 while anything blocks,
rather than trusting that the UI checked first — a direct request must not be a way around it.

## Quality (Phase 17)

An audit of what was already built, then fixes for what it found. Nothing here adds a feature.

**Every route is rate limited.** Only the AI and upload routes had limits; 35 others — reads,
draft saves, version and export routes — had none. `@fastify/rate-limit` is now global at 300
requests a minute per client, with the stricter per-route limits (AI 10–20 an hour, uploads)
still applying on top. 300 is far above what a person clicking produces, and autosave is
debounced, so only a script reaches it.

**Rate limits key on the real client address.** Behind a hosting proxy every request appears to
come from the proxy, so all visitors would share one bucket and one person could lock everyone
out. `TRUST_PROXY=true` makes Fastify read `X-Forwarded-For`. It defaults to off because
without a proxy the header is client-controlled, and trusting it would let anyone dodge limits.

**Security headers** come from `@fastify/helmet`: Content-Security-Policy, HSTS, `nosniff`,
frame denial. Cross-origin resource policy is set to `cross-origin` because the web app is on a
different origin and must be able to read the DOCX download.

**Secrets stay out of logs.** Pino redacts the `authorization` and `cookie` headers. The AI and
database error paths already logged only a public message; tests throw errors containing fake
keys and connection strings and assert none reach a response.

**A render crash no longer blanks the page.** An error boundary wraps every in-app page, reset
by route so moving elsewhere recovers without a reload, and an outer one wraps the whole app.
It tells the user saved work is safe — true, since every edit is persisted by the server — and
logs the error rather than showing a stack trace.

**Pages load when visited.** The app shipped as one 1 MB script, so the landing page downloaded
the rich-text editor and every template before showing a headline. Everything past the landing
and sign-in pages is now `React.lazy`; the editor (TipTap, ~340 kB) loads only in the editor.
React and the Supabase client are their own chunks, so a deploy invalidates app code but not
libraries that rarely change. No chunk is over 500 kB.

**Accessibility lint.** `eslint-plugin-jsx-a11y` runs on every component. Its findings were
fixed rather than disabled: labels are tied to their fields, headings render their content, and
the version-name field takes focus when the user opens it instead of through `autoFocus`. The one
suppression is the generic `Label` wrapper, whose `htmlFor` comes from callers.

**Known advisories, assessed rather than ignored:**

- *TipTap (moderate)* — a prototype-pollution path in `mergeAttributes`, fixed only in 3.x. We
  never pass user-shaped attribute objects: content is set from plain strings converted to a
  fixed paragraph/bullet JSON shape. Not reachable; upgrade to 3.x when it is scheduled.
- *Vite (high)* — the dev server's file-serving checks. 5.4.21 is the last 5.x; the dev server
  is never deployed, only the built static files. Keep it off public networks.

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
