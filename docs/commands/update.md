# `update` command

Refresh packages that are already declared in `agents.json`: resolve the highest
manifest version within each semver range, download artifacts, extract, and
update `agents-lock.json` (and `agents.json` when needed) unless disabled.

## Usage

```bash
agents-repo update [package-id] [options]
agents-repo up [package-id] [options]
```

With **no** `package-id`, every entry in the resolved `agents.json` `packages`
map is updated (npm-style `npm update`). With a `package-id`, only that
configured package is refreshed.

Unlike `install <package-id>`, `update <package-id>` **cannot** add a new
package that is missing from `agents.json`; the command exits `3` when the id is
not configured.

`<package-id>` is a qualified id (for example `agents-repo/sample-agent`) or an
index alias defined in `packages/index.json`.

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--global` / `-g` | update | Global scope; config/lock under `~/.agents-repo/` |
| `--yes` / `-y` | update / global | Waive dual-definition mismatches with warnings |
| `--dry-run` | global | Resolve through artifact selection; no download, extract, or save |
| `--no-save` | global | Skip `agents.json` and lock writes after a successful extract |
| `--json` | global | Machine-readable success and error output |
| `--verbose` | global | Detailed logging; multi-target updates add per-package summary lines |

`--dry-run` and `--no-save` are root-level flags (`agents-repo --dry-run update …`).

## Behavior

### Prerequisites

- Install targets come from `agents.json` `targets[]` only (no `--target` on `update`).
- Packages to update must already appear under `packages` in `agents.json`.

### Multi-target fan-out

When `agents.json` lists multiple `targets`, `update` refreshes each configured package once
per target (same targets × packages loop as bulk `install`).

With `--verbose` and more than one configured target, stdout includes an additional per-package
summary line after the per-target success lines (package id, version, target count, and target
names). `--json` output is unchanged.

### Version selection

For each configured package, `update` picks the highest manifest version that
satisfies the semver range in `agents.json` (no prereleases), same as bulk
`install`.

### vs `install`

| Invocation | Adds new `packages` entry? |
| --- | --- |
| `install <package-id>` | Yes (ad-hoc default) |
| `update <package-id>` | No — must already be configured |
| `install` (no args) | Syncs all configured packages |
| `update` (no args) | Refreshes all configured packages (same pipeline as bulk `install`) |

### Install pipeline

The command follows [`specs/cli-protocol.md`](../../specs/cli-protocol.md) (same
steps as bulk `install` for configured ids).

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (including empty `packages` map with no `package-id`) |
| `3` | Missing target, `package_not_configured`, or other config validation error |
| `4` | Config conflict not waived |

See [`specs/command-contracts.md`](../../specs/command-contracts.md) for the full
exit code table.

### JSON output

With `--json`, multi-package success emits:

```json
{
  "warnings": [],
  "packages": [
    {
      "packageId": "agents-repo/sample-agent",
      "version": "1.0.0",
      "target": "cursor",
      "extractRoot": "/path/to/project",
      "artifactUrl": "https://…",
      "saved": true,
      "dryRun": false,
      "global": false,
      "noSave": false,
      "warnings": []
    }
  ]
}
```

Warnings are deduplicated at the top level; per-package `warnings` arrays are
empty in the `packages` entries (same shape as bulk `install`).

## See also

- [`install`](install.md)
- [`list`](list.md)
