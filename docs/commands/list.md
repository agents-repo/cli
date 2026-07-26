# `list` command

List installed packages from the project lock or global install state.

## Usage

```bash
agents-repo [global-options] list
agents-repo [global-options] ls
```

`--json`, `--verbose`, and `--yes` / `-y` are **root-level** flags and MUST appear
before the subcommand (for example `agents-repo --json list`, not
`agents-repo list --json`). Commander returns exit `2` for unknown subcommand
options when root flags are placed after `list`.

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--global` / `-g` | list | List packages recorded in `~/.config/agents-repo/agents-global.json` |
| `--json` | global | Machine-readable output |
| `--yes` / `-y` | global | Waive dual-definition config conflicts with warnings (project scope) |

## Behavior

### Project scope (default)

`list` resolves `agents.json` (when present) and reads `agents-lock.json` from
the same directory (or `AGENTS_REPO_CONFIG` override). Each lock entry is shown
with its exact version and install target. When `agents.json` declares a semver
range for the package, it is included in `--json` output as `range`.

Missing lock file: exit `0` with an empty list.

### Global scope (`-g`)

`list -g` reads `agents-global.json` under `~/.config/agents-repo/`. This file
is written on successful global-scope `install` when saves are enabled. Missing
file: exit `0` with an empty list.

Pre-existing global extracts without `agents-global.json` do not appear until a
global install runs again.

### Output

**Text (default):** one line per package:

```text
agents-repo/sample-agent@1.0.0  target=cursor
```

**JSON (`--json`):**

```json
{
  "scope": "project",
  "rootPath": "/path/to/project",
  "resolvedRef": "v2.0.0",
  "warnings": [],
  "packages": [
    {
      "id": "agents-repo/sample-agent",
      "version": "1.0.0",
      "target": "cursor",
      "integrity": "sha256-…",
      "artifact": "1.0.0-cursor.zip",
      "range": "^1.0.0"
    }
  ]
}
```

Config warnings appear in the `warnings` array (JSON) or on stderr as
`warning: …` lines (text), matching `search`.

## Examples

Project listing:

```bash
agents-repo list
```

Global listing:

```bash
agents-repo list -g
```

JSON:

```bash
agents-repo --json list
```

## Related specs

- [global-install-state.md](../../specs/global-install-state.md) — `agents-global.json`
- [lock-schema.md](../../specs/lock-schema.md) — project lock entries
- [command-contracts.md](../../specs/command-contracts.md) — `list` / `ls` surface

## See also

- [`install`](install.md) — install packages by id
- [`search`](search.md) — search the registry catalog
