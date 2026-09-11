---
description: Implement a CareerLens AI feature slice following the project working method
---

Feature: $ARGUMENTS

Before coding:
1. Read CLAUDE.md.
2. Read docs/ARCHITECTURE.md and any relevant docs under docs/.
3. Inspect the existing implementation and tests for the affected module(s).

Requirements:
- TypeScript strict mode.
- Reuse existing components/utilities where possible; do not duplicate logic.
- Validate all external/AI data with Zod (packages/validation).
- Keep business logic out of React page components.
- Add tests for important logic and failure cases.
- Do not modify unrelated modules.

AI rules when applicable:
- Never invent resume facts.
- Return structured output from Gemini; validate before trusting it.
- Mark uncertain suggestions as requiresVerification: true.
- Never silently overwrite user content — go through the diff/approval flow.

After implementation:
1. Run typecheck (`npm run typecheck`).
2. Run lint (`npm run lint`).
3. Run unit/component tests (`npm test`).
4. Run targeted E2E tests when applicable.
5. Fix failures.
6. Review changed files for unnecessary complexity or scope creep.
7. Update docs if contracts changed.
8. Summarize files changed, tests run, and any known limitations.
