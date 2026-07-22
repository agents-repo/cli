# `init` command

Initialize or update `agents.json` in the current project with merge-safe
semantics. The command resolves the schema gate, detects or accepts an install
target, and writes only agents-repo-managed fields.

## Usage

```bash
agents-repo init [options]
```

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--target <id>` | init | Set install target id (for example `cursor`, `github-copilot`) |
| `--force` | init | Overwrite agents-repo-managed keys in the active schema gate target |
| `--yes` / `-y` | init / global | Waive dual-definition conflicts with warnings |
| `--verbose` | global | Include marker paths when target detection is ambiguous |

`--yes` is available on the root program (`agents-repo -y init`) and on
`init` (`agents-repo init -y`).

## Behavior

### Config path

- By default, `agents.json` is created or updated in the current working
  directory.
- `AGENTS_REPO_CONFIG` may point to an absolute path for the config file; the
  lock file lives in the same directory.
- Install target **detection** always uses the current working directory as the
  project root, not the directory of `AGENTS_REPO_CONFIG`.

### Schema gate

Init uses the schema gate to decide where managed fields are written:

| Gate mode | Result |
| --- | --- |
| `greenfield` | Top-level canonical `agents.json` |
| `top-level-ours` | Merge into existing top-level managed fields |
| `namespace` | Merge into the `@agents-repo` namespace block |

Foreign keys outside the active gate target are preserved.

### Install target resolution

| Condition | Behavior |
| --- | --- |
| Existing managed `target`, no `--target` | Target left unchanged (idempotent re-init) |
| `--target` matches existing | No change to target |
| `--target` differs from existing, no `--force` | Exit `3` |
| `--target` differs, with `--force` | Managed `target` updated |
| No existing `target`, no `--target` | Run filesystem marker detection |
| Top-level `target` missing, namespace has `target` | Propagate namespace `target` to top level |
| Detection finds one target | Use detected target |
| Detection finds none or multiple | Exit `3`; pass `--target <id>` |

Interactive target pickers are not implemented; ambiguous or missing detection
requires `--target`.

### Conflicts and `--yes`

When an existing file has dual-definition conflicts (for example `target` at
both top level and under `@agents-repo`), init exits with code `4` unless
`--yes` is set. With `--yes`, init continues and prints warnings to stderr.

### Environment overrides

- `AGENTS_REPO_REGISTRY_URL` applies when **reading** config later; init does
  not persist registry URL overrides into `agents.json`.
- `AGENTS_REPO_CONFIG` selects the config file path only.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Unexpected runtime failure (for example config file permission or I/O errors) |
| `2` | Usage error (unknown flags or arguments) |
| `3` | Validation, parse, or target resolution failure |
| `4` | Unresolved config conflicts (without `--yes`) |

## Examples

Greenfield project with explicit target:

```bash
agents-repo init --target cursor
# Created /path/to/project/agents.json (gate: greenfield, target: cursor)
```

When conflicts are waived with `--yes`, the success line includes a warning count:

```bash
agents-repo -y init --target cursor
# Updated /path/to/project/agents.json (gate: top-level-ours, target: cursor, 1 warning(s))
```

Re-run on an existing config (no managed field changes):

```bash
agents-repo init
# Updated /path/to/project/agents.json (gate: top-level-ours, target: cursor)
```

Foreign-only `agents.json` (managed block added under `@agents-repo`):

```bash
agents-repo init --target github-copilot
```

Waive conflicts non-interactively:

```bash
agents-repo -y init --target cursor
```

Change an existing target:

```bash
agents-repo init --target github-copilot --force
```

## Related specs

- [config-schema.md](../../specs/config-schema.md) — schema gate and merge rules
- [target-detection.md](../../specs/target-detection.md) — marker detection
- [command-contracts.md](../../specs/command-contracts.md) — global flags and exit codes
