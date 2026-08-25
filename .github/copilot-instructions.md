# CLI Project Guidelines

## Project Purpose

This repository contains the official CLI for installing and managing
agents-repo packages from the registry (`npx agents-repo`).

The project is AI-first. Contributors and coding agents are expected to keep
implementation, workflows, and documentation aligned so tasks can be completed
without relying on undocumented tribal knowledge.

## Primary References

Before making any change, agents MUST consult the relevant source-of-truth
docs/specs first.

Mandatory for all changes:

- `README.md`
- `docs/development.md`
- `docs/testing.md`
- `docs/ARCHITECTURE.md`
- `specs/` (when behavior is normative)
- `.github/CONTRIBUTING.md`
- `.github/pull_request_template.md`

Mandatory before structural or architectural changes:

- `docs/architecture/ddd-decision.md`

If a change alters local setup, contributor workflow, review expectations,
validation commands, architecture, or project structure, update the affected
docs/specs in the same change.

If code and docs/specs disagree, resolve the mismatch in the same change by
updating docs/specs or aligning implementation.

## Architectural Decisions

Do NOT change module boundaries or project structure without updating
`docs/architecture/ddd-decision.md` in the same pull request.

## Code Expectations

- Prefer small, targeted changes over broad rewrites.
- Preserve the TypeScript + Node ESM structure.
- Favor deterministic CLI behavior over clever abstractions.
- Avoid adding dependencies unless they clearly reduce maintenance cost.

## Validation

Before handing off work, run the relevant subset of:

1. `npm run env:check`
2. `npm run lint:all`
3. `npm run test`
4. `npm run typecheck`
5. `npm run check:secrets`

See `docs/testing.md` for test conventions.

If a command cannot be run, explicitly say why in the handoff.

## Pre-ready handoff

Before handoff on a task branch, agents MUST complete the organization
[Pre-ready agent handoff](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#pre-ready-agent-handoff)
norm, run the **Validation** commands above, perform a self-review, and update
the **draft** PR with evidence. Agents MUST NOT mark pull requests ready for
review. After editing `.github/copilot-instructions.md`, run
`npm run sync:ide-instructions`.

## Documentation Standard

Any user-facing behavior, contributor workflow, architectural decision, or AI
workflow change MUST be documented.

## Pull Requests

Use `.github/pull_request_template.md` for PR descriptions.

`## Related Issues` MUST include a tracking reference: `Closes #<issue-number>`
for standard tasks, or the security-advisory format defined in the **Workflow
exceptions** section of `.github/CONTRIBUTING.md` when applicable.

## Required Workflow (Task Start)

Before implementation, agents MUST:

1. Open a tracking issue (matching issue form when available).
2. Create a branch named `<prefix>/<issue-number>-<slug>`.
3. Push the branch and open a draft pull request before implementation commits.
   Pull requests MUST be created as drafts (`gh pr create --draft`). In
   `## Related Issues`, include `Closes #<issue-number>` for standard tasks, or
   follow the security-advisory format defined in the **Workflow exceptions**
   section of `.github/CONTRIBUTING.md` when applicable.

Agents MAY push additional commits to the task branch when requested.
Agents MUST NOT push to `main`, merge PRs into `main`, or mark pull requests
ready for review.
After validation, the developer manually marks the pull request ready for
review; agents MUST NOT perform that step.

## Default Branch Integration (Agents)

- AI agents MUST NOT merge pull requests into `main` or push directly to `main`.
- Integration to `main` is a human-only step after review.

## Issue and PR Template Enforcement

When opening tracking issues, agents MUST use the matching category form in
`.github/ISSUE_TEMPLATE/`:

- bug or inconsistency: `.github/ISSUE_TEMPLATE/bug-inconsistency.yml`
- spec change: `.github/ISSUE_TEMPLATE/spec-change.yml`
- feature proposal: `.github/ISSUE_TEMPLATE/feature-proposal.yml`
- task or chore: `.github/ISSUE_TEMPLATE/task-chore.yml`

Documentation-only work uses the task/chore issue category and the `docs/`
branch prefix.

Branch names MUST follow `<prefix>/<issue-number>-<slug>`, where `<slug>` is
short lowercase kebab-case:

- bug or inconsistency: `fix/`
- spec change: `spec/`
- feature proposal: `feat/`
- task or chore: `chore/`
- documentation-only work: `docs/`

See `.github/CONTRIBUTING.md` **Branch Naming** and the organization
[branch prefix reference](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#branch-prefix-reference).
Branch prefix categorizes work; conventional **commit** (or squash-merge)
prefix determines automated release bumps.

## Commit Message Convention

See `.github/CONTRIBUTING.md` for conventional commit prefixes.

## GitHub Communication Method (gh CLI Preferred)

- view issue: `gh issue view <number> --repo agents-repo/cli`
- create draft PR: `gh pr create --repo agents-repo/cli --draft --title "..." --body-file <file>`

For long issue or PR bodies, prefer `--body-file` over inline quoted text.

## Cursor Cloud environment

This repository commits `.cursor/environment.json`. Cloud Agent builds run
`.cursor/install.sh` (nvm Node from `.nvmrc`, npm from `packageManager`,
then `HUSKY=0 npm ci`).

`/exec-daemon/node` (Node 22) may precede nvm on `PATH`. Before running
repo scripts, prepend the pinned Node bin:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use
export PATH="$(dirname "$(nvm which 24.18.0)"):$PATH"
```

Do not start long-running servers from `install`.

After editing `.github/copilot-instructions.md`, regenerate IDE instruction mirrors:

```bash
npm run sync:ide-instructions
```
