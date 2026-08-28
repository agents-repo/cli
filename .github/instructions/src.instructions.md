---
applyTo: "src/**"
description: "Use for CLI TypeScript implementation under src/."
---

# CLI Source Instructions

- Follow `.github/CONTRIBUTING.md` **Required Workflow** (issue → branch →
  draft PR before implementation).
- Preserve module boundaries per
  [docs/architecture/ddd-decision.md](../../docs/architecture/ddd-decision.md).
- Normative CLI behavior lives in `specs/`; do not invent commands or flags
  here.
- After edits, run `npm run test`, `npm run typecheck`, and `npm run lint:all`.
