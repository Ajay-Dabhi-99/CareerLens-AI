---
name: code-review
description: Use when reviewing a CareerLens AI diff for correctness, duplication, and adherence to project architecture rules.
---

# Code review

Check, in order:

1. **Product safety rules** (CLAUDE.md): no invented resume facts, no silent overwrites,
   `requiresVerification` used correctly, AI output validated with Zod before use.
2. **Architecture**: no business logic inside React components; AI calls go through
   `AIProvider`; API routes enforce auth + ownership.
3. **Correctness**: does the change do what it claims, including edge cases (empty resume
   sections, missing JD, malformed dates, oversized files)?
4. **Duplication / simplification**: is there existing code in `packages/` or
   `apps/*/src` that already does this?
5. **Tests**: does new logic have coverage, including a failure case?
6. **Scope**: are unrelated files touched without reason?

Report findings ranked by severity with file:line references. Don't apply fixes unless asked.
