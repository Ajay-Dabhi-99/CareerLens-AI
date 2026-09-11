---
name: react-feature
description: Use when building or modifying a React/TypeScript feature in apps/web for CareerLens AI (upload, editor, analysis views, job match, versions, export UI).
---

# React feature (apps/web)

- Feature code lives under `apps/web/src/features/<feature-name>/`, shaped as
  `components/`, `hooks/`, `api/`, `types/` plus an `index.ts` barrel (only add the
  subfolders the feature actually needs). Shared UI lives in `apps/web/src/components/`;
  cross-cutting hooks in `apps/web/src/hooks/`. Import other features only through their
  `index.ts` barrel, never by reaching into their internals. See CLAUDE.md's "Feature
  folder shape" for the full convention.
- No business logic in components. Parsing, scoring, matching and AI orchestration are
  backend concerns — components call the API and render what comes back.
- Server state (API data) goes through TanStack Query; client/editor/UI-only state goes
  through Zustand. Don't duplicate server data into Zustand stores.
- Forms use React Hook Form + Zod resolvers, reusing schemas from `@career-lens-ai/validation`
  wherever the shape matches a domain type.
- Every async view needs explicit loading, error and empty states — no bare spinners with
  no failure path.
- AI-touching UI (suggestions, rewrites) must render through the diff/approval pattern:
  show current vs. suggested, with Accept / Edit / Reject. Never apply an AI suggestion
  directly to state without that step.
- Accessibility: labeled inputs, visible focus states, keyboard operability, sufficient
  contrast. Respect `prefers-reduced-motion` for any animation.
- Add a component test (React Testing Library) for new interactive behavior, and a unit
  test for any extracted pure logic.
- After changes: `npm run typecheck`, `npm run lint`, `npm test` (see `.claude/commands/test.md`).
