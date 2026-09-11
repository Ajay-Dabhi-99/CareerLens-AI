# CareerLens AI

AI-Powered Resume Intelligence & Job Matching Platform — a production-style SaaS that
parses a resume, runs a deterministic ATS-style health analysis, adds Gemini-powered
review and rewrites, supports in-browser editing with full version history, optionally
matches against a Job Description, and exports a polished PDF/DOCX.

The full product specification lives in
[docs/CareerLens_AI_Master_Spec.docx](docs/CareerLens_AI_Master_Spec.docx) and is
summarized in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Project working rules for
Claude Code are in [CLAUDE.md](CLAUDE.md).

## Status

**Phase 0 — Foundation.** Monorepo, React app, Fastify API, shared types/validation
packages, lint, formatting, tests and environment config are in place. See
`docs/ARCHITECTURE.md` for the full 19-phase build order.

## Getting started

```bash
npm install
cp apps/web/.env.example apps/web/.env   # already present with placeholder values
cp apps/api/.env.example apps/api/.env   # already present with placeholder values

npm run dev:api    # Fastify API on http://localhost:5000
npm run dev:web    # Vite dev server on http://localhost:5173
```

## Quality gate

```bash
npm run typecheck
npm run lint
npm test
```

## Repository layout

```
apps/web/               React + TypeScript frontend (Vite)
apps/api/                Node.js + TypeScript backend (Fastify)
packages/types/          Shared domain types + AIProvider contract
packages/validation/     Zod schemas mirroring the domain types
packages/config/         Shared environment schemas
docs/                    Master spec + architecture notes
.claude/                 Claude Code skills and slash commands for this project
```
