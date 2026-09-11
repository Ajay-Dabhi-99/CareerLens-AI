---
description: Run the CareerLens AI security and privacy checklist against recent changes
---

Check the current diff (or the whole repo if $ARGUMENTS says "full") against
docs/ARCHITECTURE.md and CLAUDE.md's security rules:
- Gemini API credentials stay server-side only.
- Every private API route is authenticated; ownership is enforced in DB queries.
- Upload MIME type and size are validated; uploaded document text is treated as untrusted.
- Expensive AI operations are rate-limited.
- No unnecessary AI prompt/response data containing personal information is stored.
- Rendered resume content is sanitized.
- Download endpoints are protected.
- Resumes/files can be deleted by their owner.

Report concrete findings with file:line references. Do not apply fixes unless asked.
