---
name: ats-engine
description: Use when implementing or changing the deterministic ATS-style scoring engine or its category analyzers for CareerLens AI.
---

# ATS scoring engine

- This is deterministic code, not AI. It must work without any Gemini call and must
  produce the same score for the same input every time.
- Category weights live in exactly one place: `packages/types/src/ats.ts`
  (`ATS_CATEGORY_WEIGHTS`). Never hardcode a weight elsewhere — import it.
- `finalScore = sum(categoryScore * categoryWeight)`. Each category analyzer returns a
  0-100 (or 0-1, pick one convention and use it everywhere) score plus human-readable
  `findings` explaining *why* — the UI must be able to show the reasoning, not just a bar.
- Categories (Section 10 of the master spec): ATS compatibility/structure, skills quality,
  experience strength, impact & achievements, keyword quality, readability, formatting,
  professionalism/completeness.
- Never present the result as an exact score used by a specific ATS vendor. Label it
  "ATS-style compatibility" or "Resume Health" score in any user-facing copy.
- Each analyzer should be a small, independently testable pure function taking `Resume` (and
  optionally `JobRequirement[]` for the keyword category) and returning an `AtsCategoryResult`.
- Add unit tests per analyzer covering: a strong resume, a weak resume, and edge cases
  (empty section, missing dates, no skills listed).
