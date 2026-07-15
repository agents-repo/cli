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

| Flag | Short | Scope |
| --- | --- | --- |
| `--help` | `-h` | All commands |
| `--version` | `-V` | Root program |
| `--json` | | Machine-readable output |
| `--verbose` | | Detailed logging |
| `--yes` | `-y` | Non-interactive; continue past conflicts with warnings |
| `--dry-run` | | No side effects per `cli-protocol.md` |
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
| `search` | `find` | Reserved (issue #10) |
| `list` | `ls` | Reserved (issue #11) |

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
| `--global` / `-g` | Extract to `~/.config/agents-repo/`; do not mutate project config/lock |
| `--target <id>` | Override install target for this invocation |
| `--no-save` | Skip `agents.json` and lock writes |
| `--dry-run` | Resolve only; no download, extract, or save |
| `--yes` / `-y` | Non-interactive; waive conflicts with warnings |

MVP argument grammar: `install <package-id>` where `<package-id>` is a qualified id or index
alias. Bulk: `install` with no arguments syncs all entries in `packages` (issue #9).

Flag `-g` overrides config `global: true` for that invocation when both apply.

### Global install directory

Global extract target: `~/.config/agents-repo/` (XDG-friendly).

Project `agents.json` and `agents-lock.json` remain at the config directory (project root by
default). Global installs MUST NOT modify them (npm `install -g` parity).

## Deferred / Post-MVP Interfaces

Reserved for follow-up feature issues. MVP MUST NOT implement these interfaces.

| Interface | Description | Tracking |
| --- | --- | --- |
| `install <package-id>:<selector>` | Install one agent or flow by exact id | Follow-up (colon) |
| `--agents <id>` (repeatable) | Install listed agents from package | See follow-up issue (flags) |
| `--flows <id>` (repeatable) | Install listed flows from package | See follow-up issue (flags) |

After follow-up issues are filed, this section MUST link to `agents-repo/cli#<number>`.

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
