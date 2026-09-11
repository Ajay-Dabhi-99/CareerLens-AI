---
name: testing
description: Use when adding or reviewing tests for CareerLens AI, or deciding what kind of test a change needs.
---

# Testing strategy

Match the test to the layer (Section 24 of the master spec):

| Layer | Tool | Examples |
|---|---|---|
| Unit | Vitest | score calculator, keyword matcher, date parser, normalization, version diff |
| Component | Vitest + React Testing Library | upload UI, score card, suggestion card, editor actions |
| Integration | Vitest (`app.inject`) | API -> DB, API -> AI provider mock, resume analysis flow |
| E2E | Playwright (added Phase 18) | login -> upload -> analyze -> edit -> version -> export; optional JD flow |
| Contract | Vitest + Zod | AI structured outputs against their schemas |

Rules:

- New logic gets a test in the same change, not a follow-up.
- Mock the `AIProvider`, not the Gemini SDK, when testing anything above the AI service
  layer — keeps tests fast and deterministic.
- Security-relevant paths (unauthorized access, invalid/oversized file, rate limit,
  injection-like resume content) need explicit negative tests, not just happy-path.
- Run `npm run typecheck`, `npm run lint`, `npm test` before considering a change done.
