# CareerLens AI

AI-Powered Resume Intelligence & Job Matching Platform — a production-style SaaS that
parses a resume, runs a deterministic ATS-style health analysis, adds Gemini-powered
review and rewrites, supports in-browser editing with full version history, optionally
matches against a Job Description, and exports a polished PDF/DOCX.

The full product specification lives in
[docs/CareerLens_AI_Master_Spec.docx](docs/CareerLens_AI_Master_Spec.docx) and is
summarized in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Project working rules for
Claude Code are in [CLAUDE.md](CLAUDE.md).

## Status

**Phase 17 — Quality.** Done so far:

- **Phase 0 — Foundation:** monorepo, React app, Fastify API, shared types/validation
  packages, lint, tests, environment config.
- **Phase 1 — UI System:** Tailwind CSS v4 + shadcn-style design tokens, responsive app
  shell (sidebar + header), dashboard shell, reusable loading/error/empty states.
- **Phase 2 — Authentication:** Supabase Auth email/password sign-up, login, session
  persistence, sign-out, protected routes, and a token-verifying API (`GET /api/me`).
  Google Sign-In is deferred until the Google Cloud Console OAuth client is set up —
  see `docs/ARCHITECTURE.md`.
- **Phase 3 — Resume upload:** anonymous quick-analysis uploads with TTL sessions and
  rate limiting, plus authenticated uploads persisted to private storage. File type is
  validated by magic bytes, not the declared MIME type.
- **Phase 4 — Parsing:** PDF/DOCX/TXT text extraction, section detection and
  normalization into the canonical `ResumeData` model.
- **Phase 5 — ATS engine:** eight deterministic weighted analyzers producing the Resume
  Health score with explainable findings. No AI involved — the same resume always scores
  the same. Anonymous users get the score and category breakdown plus the three most
  important findings; the rest require an account.

- **Phase 6 — Gemini integration:** `AIProvider` interface, prompts, structured output,
  Zod validation and a retry policy built for free-tier reality. Backend only; the browser
  never sees an API key.
- **Phase 7 — AI resume review:** pros, cons, section reviews and prioritised actions,
  grounded in the stored file rather than anything the browser sends. Reviews are saved, so
  a resume is reviewed once and read back thereafter.

- **Phase 8 — Resume editor:** section-by-section editing with TipTap, debounced autosave,
  undo/redo and a live score. The original parse is kept immutable so any edit can be
  reverted.

- **Phase 9 — AI editing:** rewrite actions for the summary, individual bullets, projects
  and skills grouping. Options are shown for a choice and never applied automatically;
  accepted AI text is marked unverified until the user confirms it.

- **Phase 10 — Diff and approval:** every suggestion is shown as a word-level diff with
  Accept, Edit and Reject. Accepted changes are recorded so any of them can be put back
  later, including after closing the page.

- **Phase 11 — Versioning:** named versions, history with a score per version, a
  section-by-section comparison of any two, and restore. Restoring keeps what you had
  first; the original upload can never be deleted.

- **Phase 12 — Optional job description:** paste or upload a posting and have its
  requirements, responsibilities and keywords read out. Always skippable: nothing else in
  the product reads this data, so it cannot block anything.

- **Phase 13 — Job match:** each requirement compared against the resume and reported as
  shown, partly shown, worth checking or not shown, with the line of the resume that
  supports it. A keyword pass settles what it can; only the rest costs an AI call.

- **Phase 14 — Tailored resumes:** targeted suggestions for one posting, approved one at a
  time, saved as a new version named after the job. Your working copy and original are
  never touched, and nothing adds experience you do not have.

- **Phase 15 — Templates:** Modern, Minimal, Professional, Technical and Executive, all
  rendering the same resume on an A4 preview with page breaks shown. Every template is
  single-column so filters read it in the intended order.

- **Phase 16 — Export:** Word documents generated from structured data and PDF through the
  browser's print, both from the exact version and template on screen. A final check blocks
  export while a name, contact detail or leftover placeholder is missing.

- **Phase 17 — Quality:** rate limits on every route, security headers, secrets kept out of
  logs, a friendly screen instead of a blank page if something crashes, pages loaded only when
  visited, and accessibility lint with its findings fixed.

**Database setup:** run every file in `supabase/migrations/` in order, in the Supabase SQL
editor, before starting the API. Each ends with `notify pgrst, 'reload schema'` — without
it PostgREST keeps serving a cached schema and the API reports the new tables as missing.

Check what has actually been applied:

```bash
npm run db:check
```

See `docs/ARCHITECTURE.md` for the full 19-phase build order.

## Getting started

```bash
npm install
cp apps/web/.env.example apps/web/.env   # already present with placeholder values
cp apps/api/.env.example apps/api/.env   # already present with placeholder values

npm run dev:api    # Fastify API on http://localhost:5000
npm run dev:web    # Vite dev server on http://localhost:5173
```

## Quality gate

```bash
npm run typecheck
npm run lint
npm test
```

## Repository layout

```
apps/web/               React + TypeScript frontend (Vite)
apps/api/                Node.js + TypeScript backend (Fastify)
packages/types/          Shared domain types + AIProvider contract
packages/validation/     Zod schemas mirroring the domain types
packages/config/         Shared environment schemas
docs/                    Master spec + architecture notes
.claude/                 Claude Code skills and slash commands for this project
```
