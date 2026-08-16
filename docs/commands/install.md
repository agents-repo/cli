# `install` command

Install packages from the registry: resolve version and artifact for the active
install target, download the ZIP, verify integrity, scan for unsafe paths,
extract into the project (or global directory), and update `agents.json` and
`agents-lock.json` unless disabled.

## Usage

```bash
agents-repo install [package-id...] [options]
agents-repo i [package-id...] [options]
agents-repo add [package-id...] [options]
agents-repo inst [package-id...] [options]
```

With **no** `package-id`, the command syncs every entry in the resolved
`agents.json` `packages` map (npm-style bulk install). With one or more
`package-id` values, only those packages are installed (each id is fan-out across
configured targets).

`<package-id>` is a qualified id (for example `agents-repo/sample-agent`) or an
index alias defined in `packages/index.json`.

Repeating the same package in one command (including alias and qualified id for the same entry)
installs it once with no extra warning, matching npm `install` behavior.

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--global` / `-g` | install | Global scope: config and lock under `~/.agents-repo/` |
| `--yes` / `-y` | install / global | Waive dual-definition mismatches with warnings |
| `--force` | install | Overwrite managed files when content differs at the same lock version (see [`remove`](remove.md); not npm `install --force`) |
| `--dry-run` | global | Resolve through artifact selection; no download, extract, or save |
| `--no-save` | global | Skip `agents.json` and lock writes after a successful extract |
| `--prefer-online` | global | Fetch registry ZIPs from the network instead of the local cache |
| `--json` | global | Machine-readable success and error output |
| `--verbose` | global | Detailed logging; multi-target installs add per-package summary lines |

`--dry-run` and `--no-save` are root-level flags (`agents-repo --dry-run install …`).

## Behavior

### Prerequisites

- Install targets come from `agents.json` `targets[]` only (no `--target` on `install`).
- Bulk `install` / `update` require existing `targets` in config; otherwise exit `3`.
  Inspect configured targets with **`agents-repo targets`** (read-only).
- Greenfield **`install <package-id>`** (no manifest or `{}` only): run target detection (same as
  `init`); on failure exit `3` with a message to run `init --targets <id...>`.
- To add targets after init, use **`add-target <id...>`** (or until documented otherwise,
  `init -y --targets <all-ids> --force`).

### Multi-target fan-out

When `agents.json` lists multiple `targets`, `install` (and `update`) installs each configured
package once per target, updating lock `byTarget` slots.

Before relying on [`ci`](ci.md) in pipelines, ensure every `(package, target)` pair has a
lock slot (run bulk `install` or `update` after changing `targets` or `packages`).

With `--verbose` and fan-out across more than one install target, stdout includes an additional
per-package summary line after the per-target success lines (package id, version, target count,
and target names). `--json` output is unchanged.

### Version selection

| Condition | Version pick |
| --- | --- |
| Bulk `install` (no `package-id`) | Highest matching manifest version per `packages[<id>]` range |
| Existing `packages[<id>]` range in config | Highest matching manifest version (no prereleases) |
| Ad-hoc install (no `packages` entry) | Highest stable manifest version (no prereleases) |

### Registry resolution

Install loads the catalog, package manifest, and version-scoped `metadata.json`.
Target support is validated against index `installTargets` (when present),
metadata `compatibility.targets`, and manifest artifacts.

### Extract scope

| Scope | Extract root | Config / lock writes |
| --- | --- | --- |
| Project (default) | Project cwd | Project `agents.json` / `agents-lock.json` unless disabled |
| Global (`-g`) | `~/.agents-repo/` | Global `agents.json` / `agents-lock.json` unless disabled |

Ad-hoc project installs add `packages[<id>] = ^<resolved-version>` unless `--no-save` or
`--dry-run`. Greenfield ad-hoc installs also write `schemaVersion`, `registry`, and detected
`targets[]`.

### Install pipeline

The command follows [`specs/cli-protocol.md`](../../specs/cli-protocol.md):

1. Load config (with env overrides)
2. Resolve registry ref (including major-line aliases such as `v2.x`)
3. Fetch catalog, manifest, and metadata
4. Pick version and artifact for the install target
5. Download ZIP (read-through artifact cache when enabled), verify SHA-256, run ZIP security scan
6. Extract using registry install-target path rules
7. Persist config and lock when allowed

Re-running `install` when files already match the resolved artifact skips writes and exits `0`.
When the lock version matches but a managed file was edited locally, the command exits `1` with
`extract_modified` unless `--force` is set. Version upgrades overwrite differing files without
`--force`.

`--dry-run` stops after step 4 and prints the resolved install plan.

### Environment overrides

| Variable | Effect |
| --- | --- |
| `AGENTS_REPO_CONFIG` | Absolute path to project `agents.json` (ignored when `-g` is set) |
| `AGENTS_REPO_HOME` | Override global home directory (default `~/.agents-repo/`) |
| `AGENTS_REPO_NO_CACHE` | When non-empty, disable artifact cache read and write |
| `AGENTS_REPO_REGISTRY_URL` | Overrides `registry.url` after file resolution |

Verified registry ZIP artifacts are cached under `{AGENTS_REPO_HOME}/cache/` (npm-style
content-addressed blobs). See [`specs/artifact-cache.md`](../../specs/artifact-cache.md).
Artifact ZIP download retries transient `[registry_fetch_error]` (including HTTP 522) up to 3
attempts with 2s then 4s backoff; abort, checksum mismatch, ZIP security, and schema errors are
not retried as fetch failures. Install `--dry-run` does not download and does not write the cache.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (or successful `--dry-run`) |
| `1` | Runtime failure (network, I/O, ZIP security, checksum mismatch, `extract_modified`) |
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

Sync all declared packages:

```bash
agents-repo install
# Installed agents-repo/foo@1.0.0 ...
# Installed agents-repo/bar@2.0.0 ...
```

Resolve only:

```bash
agents-repo --dry-run install agents-repo/sample-agent
# Would install agents-repo/sample-agent@1.0.0 for target cursor into /path/to/project
```

Install globally (persists under `~/.agents-repo/`):

```bash
agents-repo init -g --targets cursor
agents-repo install -g agents-repo/sample-agent
```

### JSON output

With `--json`, successful installs print JSON on stdout:

- Explicit `package-id` arguments (one or more) and bulk `install` (no ids): an object with
  top-level `warnings` (deduped) and `packages` (array of per-package result objects with empty
  `warnings`).

Example per-package fields inside `packages[]`:

```json
{
  "packageId": "agents-repo/sample-agent",
  "version": "1.0.0",
  "target": "cursor",
  "extractRoot": "/path/to/project",
  "artifactUrl": "https://registry.example/.../1.0.0-cursor.zip",
  "saved": true,
  "dryRun": false,
  "global": false,
  "noSave": false,
  "warnings": []
}
```

Bulk / multi-id `--json` wrapper:

```json
{
  "warnings": [],
  "packages": [
    {
      "packageId": "agents-repo/sample-agent",
      "version": "1.0.0",
      "target": "cursor",
      "saved": true,
      "dryRun": false,
      "warnings": []
    }
  ]
}
```

Errors use a single JSON object on stderr: `{"error":{"code":"...","message":"..."}}`.

`saved` is `true` when install persistence ran for the active scope (`agents.json` /
`agents-lock.json` under the project cwd or under `~/.agents-repo/` when `-g` is set). It is
`false` for `--dry-run`, `--no-save`, or when only extraction occurred without a save path.

## Related specs

- [cli-protocol.md](../../specs/cli-protocol.md) — install pipeline steps
- [command-contracts.md](../../specs/command-contracts.md) — flags and exit codes
- [config-schema.md](../../specs/config-schema.md) — `agents.json` merge rules
- [lock-schema.md](../../specs/lock-schema.md) — lockfile integrity fields
- [ci.md](ci.md) — frozen install from lock for CI
