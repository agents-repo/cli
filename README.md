# agents-repo CLI

Official CLI for installing and managing agents-repo packages from the
registry.

```bash
npm run build
node dist/bin/agents-repo.js <command>
```

Commands (`search`, `list`, and more) land in later milestones. The `init` and
`install` commands are available today. See
[docs/commands/init.md](docs/commands/init.md) and
[docs/commands/install.md](docs/commands/install.md).

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

## IDE Agent Instructions

| Tool | Path |
| --- | --- |
| Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/agents-cli.mdc` |

Do not edit `.cursor/rules/agents-cli.mdc` directly. Run `npm run sync:cursor-rules`.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) and
[docs/development.md](docs/development.md).
