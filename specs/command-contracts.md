# Command Contracts Specification (1.0.0)

This document defines global CLI flags, exit codes, environment overrides, and command surfaces
for the agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1.0.0` | spec document version | current | Initial release |

## Purpose

Shared contracts for all CLI commands. Command implementations MUST conform to this spec and to
`cli-protocol.md` for install behavior.

## Global Flags

| Flag | Short | Description |
| --- | --- | --- |
| `--help` | `-h` | Show help (all commands) |
| `--version` | `-V` | Show CLI version (root program only) |
| `--json` | | Machine-readable output |
| `--verbose` | | Detailed logging |
| `--yes` | `-y` | Non-interactive; continue past conflicts with warnings |
| `--dry-run` | | Resolve through install step 7; no download, extract, or save |
| `--no-save` | | Skip `agents.json` and lock writes |

## Environment Overrides

| Variable | Effect |
| --- | --- |
| `AGENTS_REPO_CONFIG` | Absolute path to `agents.json`; lock file in same directory |
| `AGENTS_REPO_REGISTRY_URL` | Overrides `registry.url` after file resolution |
| `DEBUG` | Enables debug logging when set to a non-empty value |

## Command Aliases (MVP)

| Command | Alias | Status |
| --- | --- | --- |
| `install` | `i` | MVP |
| `search` | `find` | MVP |
| `list` | `ls` | MVP |
| `update` | `up` | MVP |

## Command-Specific Flags

### `init`

| Flag | Description |
| --- | --- |
| `--force` | Overwrite agents-repo-managed keys in the active schema gate target |
| `--yes` / `-y` | Non-interactive merge; waive conflicts with warnings |
| `--target <id>` | Set install target id |

Merge semantics per `config-schema.md`.

### `install`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | Global extract scope; single-package: no project config/lock writes |
| `--target <id>` | Override install target for this invocation |
| `--no-save` | Skip `agents.json` and lock writes |
| `--dry-run` | Resolve only; no download, extract, or save |
| `--yes` / `-y` | Non-interactive; waive conflicts with warnings |

MVP argument grammar: `install <package-id>` where `<package-id>` is a qualified id or index
alias. Bulk: `install` with no arguments syncs all entries in `packages` (issue #9).

**Ad-hoc install default:** when `install <package-id>` has no existing `packages` entry, step 6
selects the highest `manifest.versions[]` entry (no range filter). Step 12 writes
`packages[<id>] = ^<resolved-version>` in project scope (or bulk `global: true` exception) unless
`--no-save` or `--dry-run`. Single-package global installs skip config writes.

**Global scope:** `-g` or resolved `global: true` extracts to `~/.config/agents-repo/`. Single-package
global installs MUST NOT modify project `agents.json` or `agents-lock.json`. Bulk `install` with
`global: true` MAY update `agents.json` `packages` but MUST NOT update the project lock.

`-g` forces global extract scope even when config has `global: false`.

### `update`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | Global extract scope; same lock/config rules as bulk `install` |
| `--target <id>` | Override install target for this invocation |
| `--no-save` | Skip `agents.json` and lock writes |
| `--dry-run` | Resolve only; no download, extract, or save |
| `--yes` / `-y` | Non-interactive; waive conflicts with warnings |

Grammar: `update [package-id]` where optional `<package-id>` is a qualified id or index alias.
When `<package-id>` is provided, it MUST already exist in resolved `agents.json` `packages`; otherwise
tooling MUST exit `3` with structured code `package_not_configured`. Tooling MUST NOT add new
`packages` keys (contrast ad-hoc `install <package-id>`).

With no arguments, `update` refreshes every entry in `packages` using the same semver resolution and
install pipeline as bulk `install` (highest satisfying manifest version per range). `update` is the
explicit npm/skills parity name; behavior MAY converge with bulk `install` unless a future spec
change documents a difference.

### `list`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | List globally installed packages from `agents-global.json` |

Project scope (default): reads `agents-lock.json` beside resolved `agents.json`. Supplements each
entry with the semver range from `agents.json` `packages` when present.

Global scope (`-g`): reads `~/.config/agents-repo/agents-global.json` only. Missing file yields an
empty list.

Root `--json` emits a JSON object with `scope` (`project` or `global`), `rootPath`, `resolvedRef`
(when the backing file exists), `warnings`, and `packages` (id, version, target, integrity,
artifact, optional `range` in project scope).

### `search`

| Flag | Description |
| --- | --- |
| `[query]` | Optional keyword query; empty or whitespace returns all catalog packages |
| `--interactive` | Browse and select a package in the terminal (requires TTY) |

`search` loads the registry catalog using resolved `registry` from config (or defaults)
and `AGENTS_REPO_REGISTRY_URL`. Matching is substring-based over package id, name,
description, owner, namespace, tags, and catalog index alias keys for each package
(`@owner` queries strip the leading `@`).

Root `--json` emits a JSON object with `query`, `indexUrl`, `updatedAt`, `warnings`,
and `packages` (summary fields per entry). Interactive mode prints the selected
package id (or `{ "selected": "<id>" }` with `--json`) and does not run `install`.
When both `--interactive` and `--json` are set, prompts render on stderr so stdout
stays a single JSON document; registry and config warnings also go to stderr (not
in the `{ "selected": "<id>" }` stdout payload).

`--interactive` without an interactive stdin TTY MUST exit `2` with an invalid-usage
message. With `--json`, stdout MAY be piped; stdin MUST still be a TTY.

### Global install directory

Global extract target: `~/.config/agents-repo/` (XDG-friendly).

Project `agents.json` and `agents-lock.json` remain at the config directory (project root by
default). Single-package global installs MUST NOT modify them (npm `install -g` parity). Bulk
`install` with `global: true` MAY update `agents.json` `packages` only; see `cli-protocol.md`.

## Deferred / Post-MVP Interfaces

Reserved for follow-up feature issues. MVP MUST NOT implement these interfaces.

| Interface | Description | Tracking |
| --- | --- | --- |
| `install <package-id>:<selector>` | Install one agent or flow by exact id | [#19](https://github.com/agents-repo/cli/issues/19) |
| `--agents <id>` (repeatable) | Install listed agents from package | [#20](https://github.com/agents-repo/cli/issues/20) |
| `--flows <id>` (repeatable) | Install listed flows from package | [#20](https://github.com/agents-repo/cli/issues/20) |

After follow-up issues land, implementation MUST update this table with behavior details.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | General or runtime failure (registry/network errors MAY use this code) |
| `2` | Invalid usage or CLI flags |
| `3` | Config or validation error (missing `target`, invalid semver, schema errors) |
| `4` | Conflict detected and not waived (`--yes` absent) |

When `--yes` is present, conflicts downgrade to warnings; tooling MUST exit `0` on success.

Structured `error.code` values (e.g. `ERR_ZIP_TRAVERSAL`, `type_mismatch`) SHOULD appear in stderr
or `--json` output without expanding the exit code range in MVP.

## Cross-References

- CLI: `config-schema.md`, `lock-schema.md`, `cli-protocol.md`
