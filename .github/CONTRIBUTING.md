# Contributing

Thanks for contributing to the agents-repo CLI.

## Project Focus

This repository is the official CLI engine for installing and managing
agents-repo packages. Most changes will be CLI commands, registry integration,
specs, documentation, or workflow updates.

Because this is an AI-first project, contributor guidance must stay explicit.
When you change setup, automation, or review expectations, update the matching
docs in the same pull request.

## Docs and repository pages

For user guides and cross-repo documentation, see [agents-repo.org/docs](https://agents-repo.org/docs/).
For this repository's overview on the public site, see [agents-repo.org/repositories/cli](https://agents-repo.org/repositories/cli).

When you change a user-facing or contributor workflow in this
repository, update the corresponding page(s) in
[agents-repo/webapp](https://github.com/agents-repo/webapp) under
`src/content/docs/` in the same PR or an immediate follow-up.

## Before You Start

1. Confirm the task scope and expected outcome.
2. Open an issue using the matching form in `.github/ISSUE_TEMPLATE/`.
3. Identify the commands needed to validate the work.

Then follow **Required Workflow** below for branch, push, and draft PR setup.

Issue form selection MUST match one of these categories:

| Category | Issue form |
| --- | --- |
| Bug or inconsistency | `.github/ISSUE_TEMPLATE/bug-inconsistency.yml` |
| Spec change | `.github/ISSUE_TEMPLATE/spec-change.yml` |
| Feature proposal | `.github/ISSUE_TEMPLATE/feature-proposal.yml` |
| Task or chore | `.github/ISSUE_TEMPLATE/task-chore.yml` |

Documentation-only work uses the task/chore issue category and the `docs/`
branch prefix.

## Required Workflow

Contributors and agents MUST follow this full lifecycle.

### Task setup (before implementation)

1. Inspect and confirm issue scope:
   `gh issue view <number> --repo agents-repo/cli`
2. Create and switch to a non-`main` branch from the latest `main`.
3. Push the branch to the remote repository.
4. Open a draft pull request to `main` before implementation commits:
   `gh pr create --repo agents-repo/cli --draft --title "..." --body-file <file>`

See [docs/CLI_WORKFLOW.md](../docs/CLI_WORKFLOW.md) for command examples.

### Delivery (after draft PR)

1. Implement, validate, then hand off. After validation passes, the developer
   manually marks the pull request ready for review. Agents MUST NOT merge
   pull requests into `main`, push directly to `main`, or mark pull requests
   ready for review.

All contributors MUST integrate changes to `main` only through merged pull
requests.

GitHub cannot open a pull request when the head and base branches are
identical. Push at least one commit on the task branch before opening the draft
PR (for example
`git commit --allow-empty -m "chore: scaffold draft PR for #<issue-number>"`).

See the organization [Required Workflow][org-rw] for shared norms.

## Workflow exceptions

1. **Security vulnerabilities** — Follow the private advisory flow. In
   `## Related Issues`, use `Closes #<issue-number>` when maintainers provide
   a linked private or advisory tracking issue. Otherwise, reference the
   private security advisory identifier (for example `GHSA-...`).
2. **Maintainer emergency hotfix** — Work on a `fix/<issue-number>-<slug>`
   branch only with prior maintainer approval documented in an issue or
   advisory. Do not use a separate `hotfix/` prefix. Delivery to `main` is
   still via merged pull request.

## Branch Naming

Branch names MUST follow `<prefix>/<issue-number>-<slug>`, where `<slug>` is
short lowercase kebab-case.

| Work type | Prefix | Example |
| --- | --- | --- |
| Bug or inconsistency | `fix/` | `fix/42-config-merge-bug` |
| Spec change | `spec/` | `spec/2-agents-json-lock-protocol` |
| Feature proposal | `feat/` | `feat/8-install-package` |
| Task or chore | `chore/` | `chore/1-bootstrap-cli-scaffolding` |
| Documentation-only work | `docs/` | `docs/88-update-pr-guidance` |

See the organization [branch prefix reference](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#branch-prefix-reference)
for the canonical cross-repo mapping.

## Commit Message Convention

Use conventional-style summaries:

- `feat: add install command`
- `docs: expand contributor guidance`
- `chore: pin node and npm versions`

## Release Workflow

- Pushes to `main` run release validation checks and then execute
  `semantic-release`, which publishes the **`agents-repo`** package to npm and
  creates a GitHub Release at the **same version**. `@semantic-release/git`
  commits `package.json` and `package-lock.json` after each release. Maintainer
  setup (npm org package, trusted publisher, verification) is documented in
  [docs/npm-publishing.md](../docs/npm-publishing.md).
- **Protected `main`:** before the first successful automated release, complete
  the GitHub App + ruleset bypass + `RELEASE_APP_CLIENT_ID` (Actions variable) /
  `RELEASE_APP_PRIVATE_KEY` (Actions secret) checklist in
  [docs/npm-publishing.md — Protected `main` and release automation](../docs/npm-publishing.md#protected-main-and-release-automation).
- Release tags use the `v<version>` convention.
- Commit-to-version mapping:
  - `type!:` or `BREAKING CHANGE:` => `MAJOR`
  - `feat:` => `MINOR`
  - `fix:`, `perf:`, and `revert:` => `PATCH`

## Local Validation

Before requesting review, run:

```bash
npm run env:check
npm run lint:all
npm run typecheck
npm run test
npm run check:secrets
```

Unit test conventions are in [docs/testing.md](../docs/testing.md).

This repository uses a Husky pre-commit hook that runs `npm run lint:all`,
`npm run test:sync`, and `npm run sync:ide-instructions -- --check`.

Note: `LICENSE` is intentionally excluded from workspace markdownlint checks.

## Pull Requests

1. Keep PRs reviewable and scoped.
2. Use `.github/pull_request_template.md`.
3. Include `Closes #<issue-number>` in `## Related Issues` for standard tasks.
4. List validation commands you ran and include evidence.

## IDE setup

### Project guidelines (repo-specific)

| Install target | Path | Source |
| --- | --- | --- |
| GitHub Copilot | `.github/copilot-instructions.md` | **Canonical** — edit here |
| Cursor | `.cursor/rules/agents-cli.mdc` | Mirrored from copilot-instructions |
| Claude Code | `CLAUDE.md` | Mirrored from copilot-instructions |
| OpenAI Codex | `AGENTS.md` | Mirrored from copilot-instructions |

Regenerate mirrors after editing `copilot-instructions.md`:

```bash
npm run sync:ide-instructions
```

Do not edit `.cursor/rules/`, `CLAUDE.md`, or `AGENTS.md` directly.

### Registry workflow packages (CLI)

Install and refresh catalog packages with the [agents-repo CLI](https://github.com/agents-repo/cli).
`agents.json` points at `https://registry-proxy.maiconfz.workers.dev` (organization
catalog proxy).

Bootstrap only when `agents.json` is missing:

```bash
node scripts/run-published-agents-repo.mjs init \
  --targets github-copilot claude-code cursor openai-codex
```

In this repository, do not use bare `npx agents-repo@…` from the repo root:
npm resolves it to the local `package.json` name and fails before `dist/` exists.

Use the pinned npm scripts. After `npm run build` (or `npm test`, which compiles
`dist/`), the helper runs the local binary so this repository can dogfood
unpublished catalog schema support. When `dist/` is missing, it installs
`agents-repo@<version>` from this repo's root `package.json`:

```bash
npm run agents:install   # bulk sync from agents.json
npm run agents:update    # refresh within semver ranges
npm run agents:ci        # lock-pinned registry install (CI parity)
```

Commit `agents.json`, `agents-lock.json`, and extracted paths (`.github/agents/`,
`.cursor/skills/`, `.claude/agents/`, `.agents/skills/`). Do not hand-edit extracted
package files.

## AI Collaboration

AI agents should not rely on implicit project knowledge. Document new
expectations in `README.md`, `docs/`, or `.github/` in the same change.

[org-rw]: https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#required-workflow
