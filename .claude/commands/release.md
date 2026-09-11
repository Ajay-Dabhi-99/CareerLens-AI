---
description: Pre-release checklist for a CareerLens AI phase/milestone
---

Before considering a phase done, verify against its Definition of Done (master spec,
Section 20) and the global Definition of Done (CLAUDE.md):
1. `npm run typecheck`, `npm run lint`, `npm test` all pass.
2. Production build succeeds (`npm run build`).
3. Loading, error and empty states exist for new UI.
4. No secrets exposed to the frontend; env vars documented in .env.example.
5. Docs updated for any contract changes.
6. Summarize: files changed, tests run, known limitations, and the next recommended phase.
