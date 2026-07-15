# Testing Guide

This document describes how tests are organized in the CLI repository.

## Commands

| Command | When to use |
| --- | --- |
| `npm run test` | Full suite — **same as PR baseline CI** |
| `npm run test:watch` | Local TDD while writing tests |
| `npm run test:sync` | Tooling script tests only (`node --test`) |

## Test types and naming

| Pattern | Runner | Purpose |
| --- | --- | --- |
| `test/*.test.mjs` | `node --test` | Tooling script tests (for example sync-cursor-rules) |
| `tests/**/*.test.ts` | Vitest | Application and unit tests |

Use `describe` / `it` with explicit imports from `vitest` (no globals).

## Where to put tests

- **Tooling scripts** (`scripts/`) — tests under `test/` using `node:test`.
- **Application code** (`src/`) — tests under `tests/` using Vitest with
  `environment: 'node'`.

Co-located `src/**/*.test.ts` files are also supported by `vitest.config.ts`
when added in later issues.

## PR baseline

CI runs `npm run test`, which executes `test:sync` then `vitest run`. No build
step is required for the bootstrap test suite.
