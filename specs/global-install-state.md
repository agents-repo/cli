# Global Install State Specification (1.0.0)

This document defines the `agents-global.json` format for recording global-scope installs in the
agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1` | stateVersion | read-only | Flat package entry (lock v1 shape) |
| `2` | stateVersion | current | Same package entry shape as lock v2 (`byTarget`) |

Tooling MUST read `stateVersion` `1` and `2`. New state files MUST use `stateVersion` `2`.

## Purpose

Global extract scope (`-g` or resolved `global: true`) MUST NOT modify project `agents.json` or
`agents-lock.json` (see `lock-schema.md`). `agents-global.json` records exact resolved global install
state for `list -g` and npm `install -g` parity.

Pre-existing global extracts without this file do not appear in `list -g` until a global-scope
install runs again with saves enabled.

## File Location

- Default path: `agents-global.json` in `~/.config/agents-repo/` (same directory as global
  extract root).
- The file MUST be valid UTF-8 encoded JSON.

## Top-Level Schema

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `stateVersion` | integer | yes | MUST be `2` for new state files |
| `resolvedRef` | string | yes | Concrete registry git ref after alias resolution |
| `packages` | object | yes | Map qualified id → package entry; see [Package Entry](#package-entry) |

`resolvedRef` MUST be the concrete ref (e.g. `v2.3.1`), not a major-line alias (e.g. `v2.x`).

## Package Entry

Each entry in `packages` MUST match the lock v2 package entry shape in `lock-schema.md` (`version`,
`byTarget` with per-target `integrity` and `artifact`).

## Behavioral Rules

### Write rules

After a successful global-scope `install`, when persistence runs (not `--dry-run`, not `--no-save`):

- Tooling MUST upsert `packages[<id>]` for each installed package.
- Tooling MUST update `resolvedRef` at write time.
- Tooling MUST NOT write project `agents.json` or `agents-lock.json`.

Bulk `install` with `global: true` updates `agents.json` `packages` when applicable but MUST still
update `agents-global.json` for installed packages.

### Read rules

`list -g` reads only `agents-global.json`. A missing file yields an empty package list (exit `0`).

## Cross-References

- CLI: `lock-schema.md`, `cli-protocol.md`, `command-contracts.md`
