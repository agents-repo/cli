# agents-repo CLI

![License](https://img.shields.io/github/license/agents-repo/cli) ![PR baseline checks](https://github.com/agents-repo/cli/actions/workflows/pr-baseline.yml/badge.svg?event=pull_request) [![Quality gate status](https://sonarcloud.io/api/project_badges/measure?project=agents-repo_cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=agents-repo_cli) ![Release](https://img.shields.io/github/v/release/agents-repo/cli?sort=semver) ![npm version](https://img.shields.io/npm/v/agents-repo?style=flat&logo=npm&logoColor=white) ![npm downloads](https://img.shields.io/npm/dm/agents-repo?style=flat&logo=npm&logoColor=white) ![Stars](https://img.shields.io/github/stars/agents-repo/cli?style=flat) <!-- markdownlint-disable-line MD013 -->

![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-FE5196?style=flat&logo=conventionalcommits&logoColor=white) ![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg) ![Top language](https://img.shields.io/github/languages/top/agents-repo/cli) ![Node.js](https://img.shields.io/badge/Node.js-22%20%7C%2024-339933?style=flat&logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) <!-- markdownlint-disable-line MD013 -->

---

Official CLI for installing and managing agents-repo packages from the open
registry for supported install targets: GitHub Copilot, Cursor, Claude Code,
and OpenAI Codex.

## Install / run

```bash
npx agents-repo@latest --help
npx agents-repo@latest init --targets cursor
npx agents-repo@latest init --targets github-copilot claude-code openai-codex
```

`--target` remains an alias for `--targets` on `init`. In a fresh project without
detectable install markers, pass `--targets` using a canonical id (for example
`cursor`, `github-copilot`, `claude-code`, or `openai-codex`); otherwise `init`
may exit with code `3`.

After `install`, commit **`agents-lock.json`** (and **`agents.json`** when it
changes) so installs stay reproducible. See
[docs/commands/init.md](docs/commands/init.md) and
[docs/commands/install.md](docs/commands/install.md).

## Development

```bash
npm run build
node dist/bin/agents-repo.js <command>
```

Commands (`init`, `add-target`, `install`, `update`, `remove`, `search`, `suggest-agents`, `list`, `ci`,
`doctor`, and `targets`) are available today. npm alias parity is summarized in
[docs/npm-cli-parity.md](docs/npm-cli-parity.md). See
[docs/commands/init.md](docs/commands/init.md),
[docs/commands/add-target.md](docs/commands/add-target.md),
[docs/commands/install.md](docs/commands/install.md),
[docs/commands/update.md](docs/commands/update.md),
[docs/commands/remove.md](docs/commands/remove.md),
[docs/commands/search.md](docs/commands/search.md),
[docs/commands/suggest-agents.md](docs/commands/suggest-agents.md),
[docs/commands/list.md](docs/commands/list.md),
[docs/commands/ci.md](docs/commands/ci.md),
[docs/commands/doctor.md](docs/commands/doctor.md), and
[docs/commands/targets.md](docs/commands/targets.md).

## Stack

- Node.js **22.x and 24.x LTS** (minimum **22.12.0**); `engines.node` is `>=22.12.0 <25.0.0` for npm—supported
  lines are 22.x and 24.x ([docs/development.md](docs/development.md))
- Recommended for cli development: `.nvmrc` **24.18.0**
- npm 12.x (`packageManager` pinned to `npm@12.0.1`)
- TypeScript
- Vitest for unit tests
- ESLint, markdownlint, and YAML lint for quality gates

## Getting Started

```bash
nvm use
corepack enable npm
corepack prepare npm@12.0.1 --activate
npm ci
```

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm run env:check` | Verify Node/npm versions |
| `npm run lint:all` | Markdown, ESLint, and YAML lint |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Sync script tests + Vitest |
| `npm run check:secrets` | Scan tracked files for secret patterns |
| `npm run build` | Compile `src/bin/agents-repo.ts` to `dist/` |
| `npm run sync:ide-instructions` | Regenerate IDE instruction mirrors |
| `npm run agents:install` | Install registry workflow packages from `agents.json` |
| `npm run agents:update` | Refresh installed packages within semver ranges |
| `npm run slides:check` | Check Marp fingerprints, PDF headers, and Chrome rebuild |

Run the full PR baseline locally:

```bash
npm run env:check && npm run lint:all && npm run typecheck && npm test && npm run check:secrets
```

## CLI Commands

| Command | Documentation |
| --- | --- |
| `init` | [docs/commands/init.md](docs/commands/init.md) |
| `add-target` | [docs/commands/add-target.md](docs/commands/add-target.md) |
| `install` / `i` / `add` / `inst` | [docs/commands/install.md](docs/commands/install.md) |
| `update` / `up` / `upgrade` | [docs/commands/update.md](docs/commands/update.md) |
| `remove` / `rm` / `uninstall` / `unlink` | [docs/commands/remove.md](docs/commands/remove.md) |
| `search` / `find` / `s` / `se` | [docs/commands/search.md](docs/commands/search.md) |
| `suggest-agents` / `suggest` | [docs/commands/suggest-agents.md](docs/commands/suggest-agents.md) |
| `list` / `ls` | [docs/commands/list.md](docs/commands/list.md) |
| `ci` | [docs/commands/ci.md](docs/commands/ci.md) |
| `doctor` | [docs/commands/doctor.md](docs/commands/doctor.md) |
| `targets` | [docs/commands/targets.md](docs/commands/targets.md) |
| npm parity matrix | [docs/npm-cli-parity.md](docs/npm-cli-parity.md) |

## IDE Agent Instructions

| Tool | Path |
| --- | --- |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/agents-cli.mdc` |
| Claude Code | `CLAUDE.md` |
| OpenAI Codex | `AGENTS.md` |

Regenerate after editing `copilot-instructions.md`:

```bash
npm run sync:ide-instructions
```

Do not edit `.cursor/rules/agents-cli.mdc`, `CLAUDE.md`, or `AGENTS.md` directly.

## Platform repository dogfooding

Organization platform repositories (registry, webapp, cli, registry-proxy, and
`.github`) commit `agents.json`, `agents-lock.json`, and CLI-extracted package
paths alongside generated project-guideline mirrors. See
[organization CONTRIBUTING — Registry workflow packages](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#registry-workflow-packages-cli)
for the shared install and mirror workflow.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md),
[docs/development.md](docs/development.md), and
[docs/npm-publishing.md](docs/npm-publishing.md) (npm releases and trusted
publishing).

## Docs and repository pages

For user guides and cross-repo documentation, see
[agents-repo.org/docs/](https://agents-repo.org/docs/).
For this repository's overview on the public site, see
[agents-repo.org/repositories/cli/](https://agents-repo.org/repositories/cli/).

Presentation slides (PDF): [docs/slides/README.md](docs/slides/README.md).

When you change a user-facing or contributor workflow in this
repository, update the corresponding page(s) in
[agents-repo/webapp](https://github.com/agents-repo/webapp) under
`src/content/docs/` in the same PR or an immediate follow-up.
