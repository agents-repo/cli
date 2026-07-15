# Contributing

Thanks for contributing to the agents-repo CLI.

## Project Focus

This repository is the official CLI engine for installing and managing
agents-repo packages. Most changes will be CLI commands, registry integration,
specs, documentation, or workflow updates.

Because this is an AI-first project, contributor guidance must stay explicit.
When you change setup, automation, or review expectations, update the matching
docs in the same pull request.

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
2. **Maintainer emergency hotfix** — Work on a hotfix branch only with prior
   maintainer approval. Delivery to `main` is still via merged pull request.

## Branch Naming

| Work type | Prefix | Example |
| --- | --- | --- |
| Bug or inconsistency | `fix/` | `fix/42-config-merge-bug` |
| Spec change | `spec/` | `spec/2-agents-json-lock-protocol` |
| Feature proposal | `feat/` | `feat/8-install-package` |
| Task or chore | `chore/` | `chore/1-bootstrap-cli-scaffolding` |
| Documentation-only work | `docs/` | `docs/88-update-pr-guidance` |

## Commit Message Convention

Use conventional-style summaries:

- `feat: add install command`
- `docs: expand contributor guidance`
- `chore: pin node and npm versions`

## Release Workflow

- Pushes to `main` run release validation checks and then execute
  `semantic-release`.
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
`npm run test:sync`, and `npm run sync:cursor-rules -- --check`.

Note: `LICENSE` is intentionally excluded from workspace markdownlint checks.

## Pull Requests

1. Keep PRs reviewable and scoped.
2. Use `.github/pull_request_template.md`.
3. Include `Closes #<issue-number>` in `## Related Issues` for standard tasks.
4. List validation commands you ran and include evidence.

## IDE deployment mirrors

| Path | Source |
| --- | --- |
| `.cursor/rules/agents-cli.mdc` | `.github/copilot-instructions.md` |

Regenerate after editing `copilot-instructions.md`:

```bash
npm run sync:cursor-rules
```

Do not edit `.cursor/rules/` directly.

## AI Collaboration

AI agents should not rely on implicit project knowledge. Document new
expectations in `README.md`, `docs/`, or `.github/` in the same change.

[org-rw]: https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#required-workflow
