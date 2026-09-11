---
description: Run the full quality gate (typecheck, lint, tests) and report failures
---

Run, in order, and report results for each:
1. `npm run typecheck`
2. `npm run lint`
3. `npm test`

If anything fails, diagnose the root cause and fix it (do not skip or disable checks).
Re-run the failing step after each fix until everything passes. Summarize what was
broken and what changed.
