# Testing Guide

This document describes how tests are organized in the CLI repository.

Before agent handoff, follow the organization's
[Pre-ready agent handoff](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#pre-ready-agent-handoff)
and the full validation list in [development.md](development.md#local-validation).

## Commands

| Command | When to use |
| --- | --- |
| `npm run test` | Full suite — **local handoff and PR baseline always-on tests** |
| `npm run test:watch` | Local TDD while writing tests |
| `npm run test:sync` | Tooling script tests only (`node --test`) |
| `npm run check:docs-sync` | CLI command inventory (hard fail) + webapp drift (warnings; part of `lint:all`) |

## Test types and naming

| Pattern | Runner | Purpose |
| --- | --- | --- |
| `test/*.test.mjs` | `node --test` | Tooling scripts (sync-ide-instructions, docs-sync) |
| `tests/**/*.test.ts` | Vitest | Application and unit tests |

Use `describe` / `it` with explicit imports from `vitest` (no globals).

## Where to put tests

- **Tooling scripts** (`scripts/`) — tests under `test/` using `node:test`.
  Docs-sync parser fixtures live in `test/check-docs-sync.test.mjs` (inline
  markdown samples plus temp directories).
- **Application code** (`src/`) — tests under `tests/` using Vitest with
  `environment: 'node'`.

Co-located `src/**/*.test.ts` files are also supported by `vitest.config.ts`.

## PR baseline

CI always runs `npm run test` on Node 24 (`.nvmrc`), which triggers `pretest`
(`npm run build`) then `test:sync` and `vitest run`. Bin subprocess tests
require the compiled `dist/` output. Chrome/`slides:check` and `agents:ci` are
path-filtered extras. Optional `compat-node22` is not a required check.
