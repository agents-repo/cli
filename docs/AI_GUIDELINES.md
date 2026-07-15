# AI Guidelines

## Objective

Keep AI-assisted implementation predictable, safe, and easy to review.

## Before You Implement

1. Read [.github/copilot-instructions.md](../.github/copilot-instructions.md).
2. Read [.cursor/rules/agents-cli.mdc](../.cursor/rules/agents-cli.mdc).
3. Read [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md).
4. Read [docs/CLI_WORKFLOW.md](CLI_WORKFLOW.md) for the required issue → branch →
   push → draft PR sequence (`gh` workflow, not product CLI commands).
5. Read [docs/ARCHITECTURE.md](ARCHITECTURE.md) before structural changes.
6. Confirm scope from the linked issue.

## Working Rules

- Follow `.github/CONTRIBUTING.md` **Required Workflow** before implementation.
- Do not commit secrets.
- Keep changes scoped to issue requirements.
- Prefer small, reviewable commits.
- Update docs when behavior changes.
- Do not merge to or push directly to `main`.

After editing `.github/copilot-instructions.md`, regenerate the Cursor rule:

```bash
npm run sync:cursor-rules
```

## Verification Evidence

Required command baseline:

- `npm run env:check`
- `npm run lint:all`
- `npm run typecheck`
- `npm run test`
- `npm run check:secrets`

## Handoff Checklist

- Acceptance criteria status (pass/fail).
- Linked issue and PR.
- Security checks completed.
