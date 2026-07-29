# `targets` command

Show resolved install `targets[]` from `agents.json` (read-only).

## Usage

```bash
agents-repo [global-options] targets
```

`--json`, `--verbose`, and `--yes` / `-y` are **root-level** flags and MUST appear
before the subcommand (for example `agents-repo --json targets`, not
`agents-repo targets --json`). Commander returns exit `2` for unknown subcommand
options when root flags are placed after `targets`.

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--global` / `-g` | targets | Read `agents.json` under `AGENTS_REPO_HOME` |
| `--json` | global | Machine-readable output |
| `--yes` / `-y` | global | Waive dual-definition config conflicts with warnings (project scope) |

## Behavior

`targets` runs the same config resolution pipeline as `install` and `list`
(schema gate, conflict detection, managed field extraction). It does **not**
download packages, read the lock file, or write config.

- When `targets` is **absent** after resolution (including no `agents.json` / greenfield),
  exit `0` with an empty list (text: `No install targets configured.`; JSON:
  `"targets": []`). An explicit empty `targets: []` in config is invalid and exits `3`,
  same as other commands.
- Deprecated managed field `target` (singular) exits `3` (`deprecated_field`), same
  as other commands.
- Bulk `install` / `update` still require configured targets and exit `3` when
  missing; use `targets` to inspect configuration without installing.

Config warnings appear in the `warnings` array (JSON) or on stderr as
`warning: …` lines (text), matching `list`.

### Output

**Text (default):** one install target id per line (canonical order):

```text
github-copilot
claude-code
cursor
openai-codex
```

**JSON (`--json`):**

```json
{
  "scope": "project",
  "rootPath": "/path/to/project",
  "gateMode": "top-level-ours",
  "warnings": [],
  "targets": ["github-copilot", "claude-code", "cursor", "openai-codex"]
}
```

## Examples

Project scope:

```bash
agents-repo targets
```

Global scope:

```bash
agents-repo targets -g
```

JSON:

```bash
agents-repo --json targets
```

Waive dual-definition mismatch:

```bash
agents-repo -y targets
```

## Related specs

- [command-contracts.md](../../specs/command-contracts.md) — `targets` surface
- [config-schema.md](../../specs/config-schema.md) — `targets[]` and schema gate

## See also

- [`init`](init.md) — set initial `targets[]`
- [`add-target`](add-target.md) — append target ids
- [`install`](install.md) — requires configured targets for bulk sync
