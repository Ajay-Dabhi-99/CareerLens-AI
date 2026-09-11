---
name: backend-feature
description: Use when building or modifying a Fastify/TypeScript API feature in apps/api for CareerLens AI (routes, modules, services, DB access).
---

# Backend feature (apps/api)

- Route handlers stay thin. Real logic lives in `apps/api/src/modules/<domain>/` (request
  handling, orchestration) and `apps/api/src/services/<concern>/` (parser, ats, ai, matcher,
  exporter — reusable, framework-agnostic logic).
- Every private route is authenticated and enforces row/user ownership in its DB queries —
  never trust a client-supplied user/resume id without checking it belongs to the caller.
- Validate all request bodies/params with Zod schemas from `@career-lens-ai/validation` (or
  co-located schemas for API-only shapes). Reject invalid input with a clear 4xx, don't
  coerce silently.
- Keep the original uploaded resume file separate from structured/edited data so it's
  always recoverable.
- Any AI-provider call goes through the `AIProvider` interface
  (`@career-lens-ai/types`), never a direct Gemini SDK call from a route or module.
  Validate every AI response against its Zod schema before it touches the DB.
- Rate-limit expensive AI operations; don't log full resume/PII content in application logs.
- Add a unit test for extracted logic and an integration test (via `app.inject`, see
  `apps/api/src/__tests__/health.test.ts` for the pattern) for the route.
- After changes: `npm run typecheck`, `npm run lint`, `npm test`.
