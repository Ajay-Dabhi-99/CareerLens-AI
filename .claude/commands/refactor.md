---
description: Refactor a specified area without changing behavior
---

Target: $ARGUMENTS

Refactor the target for clarity/duplication/simplification only — no behavior change.
1. Read the current implementation and its tests fully before changing anything.
2. Make the smallest change that achieves the goal.
3. Do not touch unrelated files.
4. Run typecheck, lint and tests before and after to confirm no behavior changed.
5. Summarize what changed and why.
