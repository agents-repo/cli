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

**Published support:** `package.json` `engines.node` (`>=22.12.0 <25.0.0`) is the contract npm
uses when you add `agents-repo` as a dependency or run `npx agents-repo`. Supported Node.js LTS
release lines are **22.x** and **24.x** (minimum patch **22.12.0**, driven by `commander@^15`).

**Developing this repository:** `.nvmrc` recommends a pinned Node **24.x** patch for
contributors; `npm run env:check` requires a Node version that satisfies `engines.node`, npm major
match with `packageManager`, and warns when your Node patch differs from `.nvmrc` on the same
major. You may develop on Node **22.x** or **24.x** when both satisfy `engines.node`.

```bash
corepack enable npm
corepack prepare npm@12.0.1 --activate
npm ci
```

npm 12, Corepack, and install-script approvals apply to **this repo’s** contributor workflow.
Consumers installing the published CLI typically only need a supported Node version.

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

Install support adds runtime dependencies `adm-zip` and `gray-matter` (plus
`@types/adm-zip` for development). Neither package requires install-script
approval in the current npm 12 lockfile (`allowScripts` remains empty).

## Local Validation

Run these checks before agent handoff and before a human marks the pull request
ready for review (agents: see the organization's
[Pre-ready agent handoff](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#pre-ready-agent-handoff)):

```bash
npm run env:check
npm run lint:all
npm run typecheck
npm run test
npm run check:secrets
```

`lint:all` includes `lint:workflows` ([actionlint](https://github.com/rhysd/actionlint)
on `.github/workflows/`). Run `npm run lint:workflows` before pushing workflow
changes. See the organization
[GitHub Actions workflow linting](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#github-actions-workflow-linting)
norm. When bumping `ACTIONLINT_VERSION` in `scripts/lint-workflows.mjs`, replace
`scripts/actionlint_<version>_checksums.txt` with the matching file from the
[actionlint GitHub release](https://github.com/rhysd/actionlint/releases) and
remove the previous version's checksums file. Keep the same pin across
organization repositories.

For local CLI binary testing after code changes:

```bash
npm run build
node dist/bin/agents-repo.js --version
```

Pre-commit hooks run `npm run lint:all`, `npm run test:sync`, and
`npm run sync:ide-instructions -- --check` through Husky.

## SonarQube Cloud

Automatic Analysis reads [`.sonarcloud.properties`](../.sonarcloud.properties)
on each push to the default branch or a pull request branch. It does **not**
read `sonar-project.properties` (that filename is for CI-based analysis).

`sonar.sources` and `sonar.tests` must be disjoint directory lists (no
wildcards). `sonar.sources` is `src,scripts,docs,specs` — not `.` — so
`test/` and `tests/` are not nested under sources. Do not set `sonar.sources`
to `.` while `sonar.tests` lists nested directories; Automatic Analysis fails
with “Source and test paths overlap”.

Coverage report paths (`sonar.javascript.lcov.reportPaths`) and other external
analyzer reports are unsupported under Automatic Analysis. Do not add them
while Automatic Analysis is on.

## Project Layout

```text
src/
  bin/           # CLI entrypoint (compiled to dist/)
  modules/       # DDD modules (cli, config, registry, install, target)
specs/           # Normative CLI contracts
test/            # node:test tooling script tests
tests/           # Vitest tests (async spawn when subprocess tests use local HTTP)
scripts/         # Validation and sync scripts
docs/            # Contributor and architecture docs
```

Test conventions are documented in [testing.md](testing.md).

## npm publishing

Maintainers: see [npm-publishing.md](npm-publishing.md) for npm org setup,
trusted publishing from GitHub Actions, and release verification.
