# `install` command

Install a single package from the registry: resolve version and artifact for the
active install target, download the ZIP, verify integrity, scan for unsafe paths,
extract into the project (or global directory), and update `agents.json` and
`agents-lock.json` unless disabled.

Bulk `install` (sync all `packages` entries) is tracked in issue #9.

## Usage

```bash
agents-repo install <package-id> [options]
agents-repo i <package-id> [options]
```

`<package-id>` is a qualified id (for example `agents-repo/sample-agent`) or an
index alias defined in `packages/index.json`.

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--target <id>` | install | Override install target for this invocation |
| `--global` / `-g` | install | Global extract; single-package skips config/lock writes |
| `--yes` / `-y` | install / global | Waive dual-definition mismatches with warnings |
| `--dry-run` | global | Resolve through artifact selection; no download, extract, or save |
| `--no-save` | global | Skip `agents.json` and lock writes after a successful extract |
| `--json` | global | Machine-readable success and error output |
| `--verbose` | global | Detailed logging |

`--dry-run` and `--no-save` are root-level flags (`agents-repo --dry-run install …`).

## Behavior

### Prerequisites

- An install target must be available from `agents.json` or `--target`. Without
  either, the command exits `3`.
- Run `agents-repo init --target <id>` first when starting from an empty project.

### Version selection

| Condition | Version pick |
| --- | --- |
| Existing `packages[<id>]` range in config | Highest matching manifest version (no prereleases) |
| Ad-hoc install (no `packages` entry) | Highest stable manifest version (no prereleases) |

### Registry resolution

Install loads the catalog, package manifest, and version-scoped `metadata.json`.
Target support is validated against index `installTargets` (when present),
metadata `compatibility.targets`, and manifest artifacts.

### Extract scope

| Scope | Extract root | Config / lock writes |
| --- | --- | --- |
| Project (default) | Project cwd | Updates config/lock unless `--no-save` / `--dry-run` |
| Global (`-g`) | Global config dir | Skips project config on single-package install |

Ad-hoc project installs add `packages[<id>] = ^<resolved-version>` unless
`--no-save` or `--dry-run`.

### Install pipeline

The command follows [`specs/cli-protocol.md`](../../specs/cli-protocol.md):

1. Load config (with env overrides)
2. Resolve registry ref (including major-line aliases such as `v2.x`)
3. Fetch catalog, manifest, and metadata
4. Pick version and artifact for the install target
5. Download ZIP, verify SHA-256, run ZIP security scan
6. Extract using registry install-target path rules
7. Persist config and lock when allowed

`--dry-run` stops after step 4 and prints the resolved install plan.

### Environment overrides

| Variable | Effect |
| --- | --- |
| `AGENTS_REPO_CONFIG` | Absolute path to `agents.json` |
| `AGENTS_REPO_REGISTRY_URL` | Overrides `registry.url` after file resolution |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (or successful `--dry-run`) |
| `1` | Runtime failure (network, I/O, ZIP security, checksum mismatch) |
| `2` | Usage error |
| `3` | Validation failure (missing target, unsupported target, package not found, schema errors) |
| `4` | Dual-definition conflict in config (without `--yes`) |

## Examples

Install into a configured project:

```bash
agents-repo init --target cursor
agents-repo install agents-repo/sample-agent
# Installed agents-repo/sample-agent@1.0.0 for target cursor into /path/to/project
```

Resolve only:

```bash
agents-repo --dry-run install agents-repo/sample-agent
# Would install agents-repo/sample-agent@1.0.0 for target cursor into /path/to/project
```

Override target for one invocation:

```bash
agents-repo install agents-repo/sample-agent --target github-copilot
```

Extract globally without updating project config:

```bash
agents-repo install -g agents-repo/sample-agent --target cursor
```

### JSON output

With `--json`, successful installs print one JSON object on stdout:

```json
{
  "packageId": "agents-repo/sample-agent",
  "version": "1.0.0",
  "target": "cursor",
  "extractRoot": "/path/to/project",
  "artifactUrl": "https://registry.example/.../1.0.0-cursor.zip",
  "saved": true,
  "dryRun": false
}
```

Errors use a single JSON object on stderr: `{"error":{"code":"...","message":"..."}}`.

## Related specs

- [cli-protocol.md](../../specs/cli-protocol.md) — install pipeline steps
- [command-contracts.md](../../specs/command-contracts.md) — flags and exit codes
- [config-schema.md](../../specs/config-schema.md) — `agents.json` merge rules
- [lock-schema.md](../../specs/lock-schema.md) — lockfile integrity fields
