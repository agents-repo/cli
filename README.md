# agents-repo CLI

Official CLI for installing and managing agents-repo packages from the
registry.

## Install / run

```bash
npx agents-repo@latest --help
npx agents-repo@latest init --targets cursor
```

`--target` remains an alias for `--targets` on `init`. In a fresh project without
detectable install markers, pass `--targets` (for
example `cursor` or `github-copilot`); otherwise `init` may exit with code `3`.

After `install`, commit **`agents-lock.json`** (and **`agents.json`** when it
changes) so installs stay reproducible. See
[docs/commands/init.md](docs/commands/init.md) and
[docs/commands/install.md](docs/commands/install.md).

## Development

```bash
npm run build
node dist/bin/agents-repo.js <command>
```

Commands (`init`, `install`, `update`, `search`, `list`, and `targets`) are available today. See
[docs/commands/init.md](docs/commands/init.md),
[docs/commands/install.md](docs/commands/install.md),
[docs/commands/update.md](docs/commands/update.md),
[docs/commands/search.md](docs/commands/search.md),
[docs/commands/list.md](docs/commands/list.md), and
[docs/commands/targets.md](docs/commands/targets.md).

## Stack

- Node.js 24.x (`.nvmrc` pinned to `24.18.0`)
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
| `npm run sync:cursor-rules` | Regenerate `.cursor/rules/agents-cli.mdc` |

Run the full PR baseline locally:

```bash
npm run env:check && npm run lint:all && npm run typecheck && npm test && npm run check:secrets
```

## CLI Commands

| Command | Documentation |
| --- | --- |
| `init` | [docs/commands/init.md](docs/commands/init.md) |
| `install` / `i` | [docs/commands/install.md](docs/commands/install.md) |
| `update` / `up` | [docs/commands/update.md](docs/commands/update.md) |
| `search` / `find` | [docs/commands/search.md](docs/commands/search.md) |
| `list` / `ls` | [docs/commands/list.md](docs/commands/list.md) |
| `targets` | [docs/commands/targets.md](docs/commands/targets.md) |

## IDE Agent Instructions

| Tool | Path |
| --- | --- |
| Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/agents-cli.mdc` |

Do not edit `.cursor/rules/agents-cli.mdc` directly. Run `npm run sync:cursor-rules`.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md),
[docs/development.md](docs/development.md), and
[docs/npm-publishing.md](docs/npm-publishing.md) (npm releases and trusted
publishing).
