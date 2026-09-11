---
name: security-review
description: Use when reviewing CareerLens AI changes for security/privacy issues, or before a phase is marked done.
---

# Security & privacy checklist

From Section 26 of the master spec — check every item against the diff:

- Gemini API credentials (and any other secret) stay server-side only; never shipped to
  the frontend bundle or a client-visible response.
- Every private API route authenticates the caller and enforces ownership in DB queries
  (a user can only read/write their own resumes, versions, files, analyses).
- Upload MIME type and size are validated server-side (not just in the UI).
- Uploaded document text and pasted job descriptions are treated as untrusted input —
  never interpolated into a Gemini prompt in a way that lets embedded text override system
  instructions.
- Expensive AI operations are rate-limited per user.
- AI prompt/response logs avoid storing unnecessary personal resume data.
- Rendered resume content (in the editor, preview and exports) is sanitized.
- Download/export endpoints check ownership before serving a file.
- Users can delete their own resumes and files.

Report findings with file:line references, ranked by severity. Don't apply fixes unless asked.
