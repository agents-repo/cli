# Development Workflow

## Required Workflow

Before local implementation, follow `.github/CONTRIBUTING.md` **Required
Workflow**:

1. Open a tracking issue from `.github/ISSUE_TEMPLATE/`.
2. Create a branch named `<prefix>/<issue-number>-<slug>` from latest `main`.
3. Push a scaffolding commit if needed, then open a draft pull request before
   implementation commits (`gh pr create --draft`).
4. After validation passes, the developer manually marks the pull request ready
   for review.

See [CLI_WORKFLOW.md](CLI_WORKFLOW.md) for `gh` command examples.

## Toolchain

This project follows the pinned runtime declared in `.nvmrc` and `package.json`.

```bash
corepack enable npm
corepack prepare npm@12.0.1 --activate
npm ci
```

### Install script approvals (npm 12)

npm 12 requires explicit approval for dependency install scripts. Approved
packages are listed in `package.json` `allowScripts`. CI verifies no unreviewed
scripts remain after `npm ci`.

When a dependency introduces install scripts:

```bash
npm install-scripts ls
npm install-scripts approve <name>@<version>
```

Commit the resulting `allowScripts` update with your dependency change.

## Local Validation

Run these checks before marking the pull request ready for review:

```bash
npm run env:check
npm run lint:all
npm run typecheck
npm run test
npm run check:secrets
```

For local CLI binary testing after code changes:

```bash
npm run build
node dist/bin/agents-repo.js --version
```

Pre-commit hooks run `npm run lint:all`, `npm run test:sync`, and
`npm run sync:cursor-rules -- --check` through Husky.

## Project Layout

```text
src/
  bin/           # CLI entrypoint (compiled to dist/)
  modules/       # DDD modules (scaffolded in issue #3)
specs/           # Normative CLI contracts (issue #2)
test/            # node:test tooling script tests
tests/           # Vitest application tests
scripts/         # Validation and sync scripts
docs/            # Contributor and architecture docs
```

Test conventions are documented in [testing.md](testing.md).
