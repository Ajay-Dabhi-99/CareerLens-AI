# CareerLens AI — Project Instructions

CareerLens AI is a production-style SaaS that accepts a resume/CV, parses it into
structured data, performs a deterministic ATS-style health analysis, uses Gemini for
contextual AI review, lets the user edit the resume in-browser, applies controlled AI
rewrites, optionally compares against a Job Description, tailors a job-specific version,
and exports PDF/DOCX.

**Source of truth:** [docs/CareerLens_AI_Master_Spec.docx](docs/CareerLens_AI_Master_Spec.docx)
(also summarized in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Do not invent product
requirements that conflict with it.

> **Provider note:** the master spec writes its AI examples against "Claude" — that name
> refers to this coding assistant (Claude Code) building the project, not a product
> dependency. The project's own in-app AI provider is **Gemini** (Google AI Studio), decided
> 2026-09-11. Everywhere the spec says "Claude API" / "ClaudeProvider" for the resume-analysis
> feature, read "Gemini API" / "GeminiProvider" — the `AIProvider` interface in
> `packages/types/src/ai.ts` is what actually matters and is provider-agnostic.

## Critical product rules

1. Job Description is optional. Resume-only analysis is a complete product flow by itself.
2. Never invent skills, metrics, companies, certifications, dates or achievements. If the AI
   needs information not present in the resume, set `requiresVerification: true`.
3. Never silently overwrite user content. Every AI rewrite is previewable and goes through
   Accept / Edit / Reject before becoming part of a version.
4. The original uploaded resume is always recoverable, separate from edited versions.
5. AI output must be structured JSON, validated with Zod (`@career-lens-ai/validation`),
   before it touches the database or the UI.
6. Business logic (parsing, ATS scoring, matching, AI orchestration, export) lives in
   backend services/modules or shared pure functions — never inside React page components.
7. The frontend depends on the `AIProvider` interface (`@career-lens-ai/types`), never
   directly on the Gemini SDK. Gemini API credentials are server-side only.

## Stack

- Frontend: React + TypeScript + Vite, Tailwind + shadcn/ui (from Phase 1), React Router,
  TanStack Query, Zustand, React Hook Form + Zod, TipTap, Recharts.
- Backend: Node.js + TypeScript + Fastify.
- Database/Auth/Storage: Supabase (PostgreSQL, Auth, Storage).
- AI: Gemini API (Google AI Studio) via a backend `AIProvider` abstraction.
- Testing: Vitest + React Testing Library + Playwright.

## Repository layout

```
apps/web/src/
  app/          Root App component, router, global providers (Phase 1+)
  components/   Shared/reusable UI components used by more than one feature
  features/     One folder per feature — auth, dashboard, resume, analysis,
                editor, job-match, versions, export. See "Feature folder shape" below.
  hooks/        Cross-cutting hooks not owned by a single feature
  lib/          Framework-agnostic clients/utilities (e.g. lib/api.ts)
  stores/       Zustand stores for client/editor/UI state
  types/        App-only types not already covered by @career-lens-ai/types
apps/api/src/
  modules/      One folder per domain — auth, resume, analysis, ats, ai, jobs, versions, export
                (route handlers + request orchestration)
  services/     Reusable framework-agnostic logic — ai, parser, ats, matcher, exporter
  utils/        Small cross-cutting helpers
packages/types/        Shared domain types (Resume, ATS, Job, AIProvider contract)
packages/validation/   Zod schemas mirroring the domain types
packages/config/       Shared environment schemas
docs/                  Master spec + architecture notes
```

### Feature folder shape (`apps/web/src/features/<name>/`)

Each feature is self-contained. Add only the subfolders a feature actually needs, but when
present they mean:

```
features/<name>/
  components/   Feature-only UI components
  hooks/        Feature-only hooks
  api/          TanStack Query hooks/functions that call apps/api
  types/        Feature-only types
  index.ts      Barrel export — the only thing other features/app import from
```

Don't import across features by reaching into another feature's internals — import from its
`index.ts` barrel, or lift shared code into `components/`, `hooks/`, `lib/` or a package.

## Working method (follow for every feature)

1. Read this file and `docs/ARCHITECTURE.md` plus the relevant feature docs.
2. Inspect the existing implementation and tests before writing new code.
3. Plan the smallest safe change; implement one feature slice at a time.
4. Add or update tests with the implementation.
5. Run typecheck, lint and tests after each feature — fix failures before moving on.
6. Review the diff for duplicated logic and accidental scope changes.
7. Update documentation when architecture or contracts change.
8. Do not modify unrelated modules. Do not jump ahead to a later phase before the current
   phase's Definition of Done is met (see Section 20 of the master spec).

## Commands

```
npm install              # install all workspaces
npm run dev:web          # start the Vite dev server (apps/web)
npm run dev:api          # start the Fastify API in watch mode (apps/api)
npm run typecheck        # typecheck every workspace
npm run lint             # eslint across the repo
npm test                 # run every workspace's test suite
```

## AI safety rules (apply to every AI-touching feature)

- Never invent resume facts.
- Return structured output; validate with Zod; reject and log invalid responses.
- Mark uncertain suggestions as `requiresVerification: true`.
- Distinguish "missing from resume" from "user does not have the skill".
- Sanitize/treat uploaded document text as untrusted input (prompt-injection aware).
- Do not send unnecessary user metadata to the AI provider.
- Rate-limit expensive AI actions.

## Definition of done (every feature)

- Implemented in the correct module/package.
- TypeScript strict mode passes.
- Lint passes.
- Relevant tests pass (unit/component/integration/E2E as applicable).
- Loading, error and empty states exist in the UI.
- Accessibility basics covered (labels, focus, keyboard nav, contrast).
- No secrets exposed to the frontend.
- No unrelated files modified without reason.
