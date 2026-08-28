---
applyTo: "specs/**"
description: "Use for normative CLI specs and protocol definitions."
---

# CLI Specs Instructions

- Follow `.github/CONTRIBUTING.md` **Required Workflow** (issue → branch →
  draft PR before implementation).
- Specs are source of truth; align `docs/commands/` UX docs in the same change
  when behavior changes.
- Start from [specs/README.md](../../specs/README.md) for the index.
- After edits, run `npm run lint:all` and `npm run test`.
