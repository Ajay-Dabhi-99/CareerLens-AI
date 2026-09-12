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

**Phase 2 — Authentication.** Done so far:

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
