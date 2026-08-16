# `doctor` command

Run read-only diagnostics for the project agents setup: config schema, install targets,
registry connectivity, config/lock alignment, and on-disk install paths.

Normative rules live in [`specs/command-contracts.md`](../../specs/command-contracts.md).

## Usage

```bash
agents-repo [global-options] doctor
```

Root flags such as `--json`, `--verbose`, and `--yes` / `-y` follow the same placement rules as
other commands (before the subcommand).

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--yes` / `-y` | global | Waive dual-definition config conflicts with warnings |
| `--json` | global | Machine-readable output |

Project scope only in the initial release; global `doctor -g` is reserved for a follow-up issue.

## Checks

| Check id | Meaning |
| --- | --- |
| `config_schema` | `agents.json` resolves through the schema gate |
| `targets_configured` | Non-empty `targets[]` after resolution |
| `lock_present` | Valid `agents-lock.json` beside config |
| `lock_config_sync` | Config/lock parity and ranges (as `ci`, no `--force`) |
| `registry_reachable` | Registry catalog index fetch succeeds |
| `install_paths` | Locked artifacts enumerate to paths that exist on disk (no extract) |

Skipped checks appear when prerequisites fail (for example `lock_config_sync` when the lock is
missing). `doctor` runs independent checks where possible instead of failing on the first error.

`registry_reachable` fails (exit `3`, `index_schema_error`) when the catalog `schemaVersion` is
eol, other-major, malformed, or older-unlisted. Deprecated or newer-than-CLI additive index
versions pass the check and appear in `warnings`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All executed checks passed |
| `1` | Registry network or transport failure |
| `3` | Config, lock, install path, or registry schema validation failure |
| `4` | Dual-definition conflict when `--yes` is not set |

The process exit code is the **highest severity** among failed checks.

## JSON output

With `--json`, stdout is one JSON object:

```json
{
  "command": "doctor",
  "checks": [
    { "id": "config_schema", "status": "pass", "message": "agents.json resolved successfully" }
  ],
  "warnings": []
}
```

## Contrast with `list` and `ci`

| Concern | `list` | `doctor` | `ci` |
| --- | --- | --- | --- |
| Missing `byTarget` for configured target | Warning, `0` | sync fail, `3` | `3` |
| Missing on-disk install files | Not checked | `install_paths` fail, exit `3` | Re-installs files |
| Writes config or lock | No | No | No |
| Downloads registry artifacts | No | Yes (for path enumeration) | Yes (install) |

See also [`ci.md`](ci.md) and [`list.md`](list.md).
