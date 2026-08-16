# Command Contracts Specification (1.1.0)

This document defines global CLI flags, exit codes, environment overrides, and command surfaces
for the agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1.1.0` | spec document version | current | Forward-compatible registry schemaVersion gate |
| `1.0.0` | spec document version | supported | Initial release |

## Purpose

Shared contracts for all CLI commands. Command implementations MUST conform to this spec and to
`cli-protocol.md` for install behavior.

## Global Flags

| Flag | Short | Description |
| --- | --- | --- |
| `--help` | `-h` | Show help (all commands) |
| `--version` | `-V` | Show CLI version (root program only) |
| `--json` | | Machine-readable output |
| `--verbose` | | Detailed logging; multi-target install/update add per-package summary lines |
| `--yes` | `-y` | Non-interactive; continue past conflicts with warnings |
| `--dry-run` | | Resolve through install step 7; no download, extract, or save |
| `--no-save` | | Skip `agents.json` and lock writes |
| `--prefer-online` | | Fetch registry artifacts from the network instead of the local cache |

## Environment Overrides

| Variable | Effect |
| --- | --- |
| `AGENTS_REPO_CONFIG` | Absolute path to project `agents.json`; lock beside it (`-g` ignores) |
| `AGENTS_REPO_REGISTRY_URL` | Overrides `registry.url` after file resolution |
| `AGENTS_REPO_HOME` | Override global home directory (default `~/.agents-repo/`) |
| `AGENTS_REPO_NO_CACHE` | When non-empty, disable artifact cache read and write |
| `DEBUG` | Enables debug logging when set to a non-empty value |

## Command Aliases (MVP)

| Command | Alias | Status |
| --- | --- | --- |
| `install` | `i` | MVP |
| `install` | `add` | MVP (npm parity) |
| `install` | `inst` | MVP (npm parity) |
| `search` | `find` | MVP |
| `search` | `s` | MVP (npm parity) |
| `search` | `se` | MVP (npm parity) |
| `suggest-agents` | `suggest` | post-MVP |
| `list` | `ls` | MVP |
| `update` | `up` | MVP |
| `update` | `upgrade` | MVP (npm parity) |
| `remove` | `rm` | MVP |
| `remove` | `uninstall` | MVP (npm parity) |
| `remove` | `unlink` | MVP (npm parity; UX alias only — see [npm CLI parity](../docs/npm-cli-parity.md)) |

For npm reference aliases not implemented here, see [docs/npm-cli-parity.md](../docs/npm-cli-parity.md).

## Command-Specific Flags

### `init`

| Flag | Description |
| --- | --- |
| `--force` | Overwrite agents-repo-managed keys in the active schema gate target |
| `--yes` / `-y` | Non-interactive merge; waive conflicts with warnings |
| `--targets <id...>` | Set one or more install target ids (canonical order on write) |
| `--target <id...>` | Alias of `--targets` on `init` only |

Merge semantics per `config-schema.md`.

### `install`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | Global scope: config and lock under `AGENTS_REPO_HOME` (`~/.agents-repo/`) |
| `--no-save` | Skip `agents.json` and lock writes |
| `--dry-run` | Resolve only; no download, extract, or save |
| `--yes` / `-y` | Non-interactive; waive conflicts with warnings |
| `--force` | Overwrite managed files when on-disk content differs at the same lock version |

MVP argument grammar: `install <package-id>...` where each `<package-id>` is a qualified id or index
alias (one or more). Bulk: `install` with no arguments syncs all entries in `packages` (issue #9).

Duplicate package refs in one invocation (including alias and qualified id for the same package)
MUST be collapsed to a single install per resolved qualified id, preserving first-seen order and
without warnings (npm `install` parity).

**Ad-hoc install default:** when `install <package-id>...` includes ids with no existing `packages`
entry, step 6 selects the highest `manifest.versions[]` entry per id (no range filter). Step 12
writes `packages[<id>] = ^<resolved-version>` for each new ad-hoc id unless `--no-save` or
`--dry-run`. Greenfield ad-hoc installs also write `schemaVersion`, `registry`, and detected
`targets[]`.

**Targets:** resolve `targets[]` from config only. Greenfield `install <package-id>...` MAY run target
detection before fan-out. Bulk `install` / `update` MUST NOT run detection.

**Global scope:** `-g` resolves and persists `agents.json` + `agents-lock.json` under
`~/.agents-repo/` (or `AGENTS_REPO_HOME`). Project `agents.json` / `agents-lock.json` MUST NOT be
modified when `-g` is set.

**Registry schemaVersion:** `install` and `update` load the catalog and package manifests through
the classified gate in `cli-protocol.md`. Hard failures MUST exit `3` with `index_schema_error` or
`manifest_schema_error`. Deprecated index versions SHOULD warn. Unknown same-major newer index or
manifest versions MUST warn with
`Index schemaVersion "<ver>" is newer than this CLI; consider upgrading agents-repo` or
`Manifest schemaVersion "<ver>" is newer than this CLI; consider upgrading agents-repo` and MUST
NOT exit `3` solely because the version string is unknown. Warnings appear in stderr as
`warning: …` (text) and in the `warnings` array (`--json`).

### `add-target`

| Flag | Description |
| --- | --- |
| `--yes` / `-y` | Non-interactive; waive dual-definition mismatches with warnings |

Grammar: `add-target <id...>` appends install target ids to `agents.json` `targets[]` (project scope).
Duplicate ids: exit `0`, emit warning, no config write.

### `update`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | Global scope; same config/lock paths as `install -g` |
| `--no-save` | Skip `agents.json` and lock writes |
| `--dry-run` | Resolve only; no download, extract, or save |
| `--yes` / `-y` | Non-interactive; waive conflicts with warnings |
| `--force` | Overwrite managed files when on-disk content differs at the same lock version |

Grammar: `update [package-id]` where optional `<package-id>` is a qualified id or index alias.
When `<package-id>` is provided, it MUST already exist in resolved `agents.json` `packages`; otherwise
tooling MUST exit `3` with structured code `package_not_configured`. Tooling MUST NOT add new
`packages` keys (contrast ad-hoc `install <package-id>`).

With no arguments, `update` refreshes every entry in `packages` using the same semver resolution and
install pipeline as bulk `install` (highest satisfying manifest version per range). `update` is the
explicit npm/skills parity name; behavior MAY converge with bulk `install` unless a future spec
change documents a difference.

### `remove`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | Global scope; same config/lock paths as `install -g` |
| `--no-save` | Skip `agents.json` and lock writes after file deletion |
| `--dry-run` | Download locked artifacts and list paths to delete; no delete or save |
| `--yes` / `-y` | Non-interactive; waive conflicts with warnings |
| `--force` | Delete files even when on-disk content no longer matches the locked artifact |

Grammar: `remove <package-id>` where `<package-id>` is a qualified id or index alias.
The package MUST exist in resolved `agents.json` `packages` and in `agents-lock.json`; otherwise
tooling MUST exit `3` with structured code `package_not_configured` or `package_not_in_lock`.

Tooling MUST derive delete paths from each lock `byTarget` slot for the package (locked version and
artifact filename). Tooling MUST NOT re-resolve semver ranges from `agents.json` during remove.
See `cli-protocol.md` and registry `install-targets.md` uninstall semantics.

Root `--json` emits a JSON object with aggregated `warnings` and `packages` (per-target results with
`deletedPaths`, `saved`, `dryRun`, and related fields).

### `list`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | List packages from global `agents-lock.json` under `AGENTS_REPO_HOME` |

Project scope (default): reads `agents-lock.json` beside resolved `agents.json`. Supplements each
entry with the semver range from `agents.json` `packages` when present.

Global scope (`-g`): reads `agents-lock.json` under `~/.agents-repo/`. Missing lock yields an
empty list.

When resolved `agents.json` includes a non-empty `targets` list, `list` MUST warn (non-fatal,
exit `0`) for each lock package that lacks a `byTarget` slot for any configured target id.
Warnings appear in stderr (text) and in the `warnings` array (`--json`). Omit these warnings when
no targets are configured after resolution.

Root `--json` emits a JSON object with `scope` (`project` or `global`), `rootPath`, `resolvedRef`
(when the backing file exists), `warnings`, and `packages` (id, version, target, integrity,
artifact, optional `range` in project scope).

### `targets`

| Flag | Description |
| --- | --- |
| `--global` / `-g` | Read `agents.json` under `AGENTS_REPO_HOME` |

`targets` resolves `agents.json` through the schema gate and prints effective `targets[]` only.
It MUST NOT read `agents-lock.json`, fetch registry data, or write config. When `targets` is
absent after resolution (including greenfield / no config file), tooling MUST exit `0` with an
empty `targets` list. An explicit empty `targets: []` in config is invalid and MUST exit `3`
(contrast bulk `install` / `update`, which exit `3` when targets are missing after resolution).

Root `--json` emits a JSON object with `scope` (`project` or `global`), `rootPath`, `gateMode`,
`warnings`, and `targets` (canonical install target id order).

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

### `suggest-agents`

| Flag | Description |
| --- | --- |
| `--limit <n>` | Maximum ranked suggestions (default `10`) |

`suggest-agents` loads the registry catalog like `search`, collects project metadata
signals (`package.json`, root README, resolved config), scores packages per
`suggest-agents.md`, omits yanked and already-installed packages, and prints ranked
results. No install target is required.

Root `--json` emits `indexUrl`, `updatedAt`, `warnings`, and `suggestions` (each
entry includes `score` and `matchedSignals`). Empty suggestions exit `0`.

### `ci`

Grammar: `ci` with no package arguments. Project scope only in the initial spec; global `ci -g` is
reserved for a follow-up issue.

`ci` performs a frozen install from `agents-lock.json` per `lock-schema.md` (no semver
re-resolution). Tooling MUST resolve `agents.json`, validate config/lock package-set equality,
require a `byTarget` slot for every `(packageId, targetId)` pair drawn from resolved `packages` and
`targets`, then download, verify, and extract each required slot using lock `resolvedRef` and slot
`artifact` / `integrity`. On success, tooling MUST NOT write `agents.json` or `agents-lock.json`.

| Flag | Description |
| --- | --- |
| `--force` | Continue when a resolved `packages[<id>]` range does not accept lock `version` |
| `--yes` / `-y` | Waive dual-definition config conflicts with warnings (same as other commands) |

`--force` MUST NOT waive missing required `byTarget` slots or config/lock package-set mismatch.
Those conditions MUST exit `3` with structured error codes including `lock_config_package_drift`,
`missing_by_target_slot`, and `lock_version_range_mismatch`.

Missing or empty `targets` after resolution MUST exit `3`. Missing lock MUST exit `3`.

Contrast `list`: incomplete `byTarget` for configured targets is a warning on `list` (exit `0`) and
MUST be fatal on `ci` (exit `3`). See [#48](https://github.com/agents-repo/cli/issues/48).

Root `--json` on success MUST emit a single JSON object with top-level `"command": "ci"`, `warnings`,
and `packages` (same per-entry fields as bulk install). Tracking: [#16](https://github.com/agents-repo/cli/issues/16).

### `doctor`

Grammar: `doctor` with no package arguments. Project scope only in the initial spec; global
`doctor -g` is reserved for a follow-up issue (mirroring `ci`).

`doctor` runs read-only diagnostics for the project agents setup. Tooling MUST NOT write
`agents.json`, `agents-lock.json`, or extract packages. Tooling MUST run independent checks where
possible and MUST NOT fail fast before reporting all applicable checks.

| Flag | Description |
| --- | --- |
| `--yes` / `-y` | Waive dual-definition config conflicts with warnings (same as other commands) |

Each check result MUST include `id`, `status` (`pass`, `fail`, or `skip`), and `message`. Failed
checks SHOULD include structured `code` matching existing CLI error codes where applicable.

| Check id | Description | Skip when |
| --- | --- | --- |
| `config_schema` | Resolve `agents.json` through the schema gate and conflict detection | — |
| `targets_configured` | Non-empty `targets[]` | config failed |
| `lock_present` | Valid lock v2 beside config | config failed |
| `lock_config_sync` | Config/lock parity (as `ci`) | lock invalid or targets not configured |
| `registry_reachable` | Catalog index fetch | config failed |
| `install_paths` | On-disk paths from lock ZIPs | sync/registry failed |

Process exit code MUST be the highest severity among failed checks: config or validation failures
(exit `3`, including lock validation), dual-definition conflicts when not waived (exit `4`), registry
network or transport failures (exit `1`), success when no check failed (exit `0`). Skipped checks MUST
NOT affect the exit code. Config resolver warnings (including waived dual-definition) MUST appear in
`warnings` but MUST NOT alone change the exit code. Catalog schema warnings (deprecated or
newer-than-CLI index `schemaVersion`) MUST appear in `warnings` and MUST NOT alone fail
`registry_reachable` or change the exit code. Classified index schema rejects
(`index_schema_error`) MUST fail `registry_reachable` with exit `3`.

Contrast [`list`](#list): incomplete `byTarget` for configured targets is a warning on `list` (exit
`0`) and MUST be a failed `lock_config_sync` check on `doctor` (exit `3`). Contrast [`ci`](#ci):
`ci` installs from the lock; `doctor` validates without mutating state. Tracking:
[#17](https://github.com/agents-repo/cli/issues/17).

Root `--json` MUST emit a single JSON object on stdout with top-level `"command": "doctor"`,
`checks` (array of check objects), and `warnings` (string array). Text mode SHOULD print one line
per check with `ok`, `fail`, or `skip` prefix (JSON `checks[].status` remains `pass`, `fail`, or
`skip`).

### Global install directory

Global home: `~/.agents-repo/` (override with `AGENTS_REPO_HOME`). Global scope uses the same
`agents.json` + `agents-lock.json` schema as project scope. `-g` MUST NOT modify project config or
lock files.

## Dropped interfaces (not planned)

The following ideas were proposed ([#19](https://github.com/agents-repo/cli/issues/19),
[#20](https://github.com/agents-repo/cli/issues/20)) and **closed without implementation**.
The install unit remains the **full package** so config, lock, `doctor`, `ci`, and `remove` stay
aligned with on-disk artifacts.

| Interface | Description | Decision |
| --- | --- | --- |
| `install <package-id>:<selector>` | Install one agent or flow by exact id | Dropped ([#19](https://github.com/agents-repo/cli/issues/19)) |
| `--agents <id>` (repeatable) | Install listed agents from package | Dropped ([#20](https://github.com/agents-repo/cli/issues/20)) |
| `--flows <id>` (repeatable) | Install listed flows from package | Dropped ([#20](https://github.com/agents-repo/cli/issues/20)) |

Tooling MUST NOT implement subset or selective install unless a new spec issue reopens the design
(including lock and path semantics).

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | General or runtime failure (registry/network errors MAY use this code) |
| `2` | Invalid usage or CLI flags |
| `3` | Config or validation error (including `index_schema_error` / `manifest_schema_error`) |
| `4` | Conflict detected and not waived (`--yes` absent) |

When `--yes` is present, conflicts downgrade to warnings; tooling MUST exit `0` on success.

Structured `error.code` values (e.g. `ERR_ZIP_TRAVERSAL`, `type_mismatch`) SHOULD appear in stderr
or `--json` output without expanding the exit code range in MVP.

## Cross-References

- CLI: `config-schema.md`, `lock-schema.md`, `cli-protocol.md`
