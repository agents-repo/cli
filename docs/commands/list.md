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
| `--global` / `-g` | list | List packages from `~/.agents-repo/agents-lock.json` |
| `--json` | global | Machine-readable output |
| `--yes` / `-y` | global | Waive dual-definition config conflicts with warnings (project scope) |

## Behavior

### Project scope (default)

`list` resolves `agents.json` (when present) and reads `agents-lock.json` from
the same directory (or `AGENTS_REPO_CONFIG` override). Each lock entry is shown
with its exact version and install target. When `agents.json` declares a semver
range for the package, it is included in `--json` output as `range`.

Missing lock file: exit `0` with an empty list.

When `agents.json` resolves a non-empty `targets` list, `list` compares each lock
package’s `byTarget` keys to that list. A configured target id with no matching
`byTarget` slot for a package produces a warning (stderr in text mode, `warnings`
in JSON). Listing still exits `0`. When no targets are configured after resolution,
these warnings are omitted. Warnings apply to every package entry in the lock, not only ids listed
in `agents.json` `packages`.

Planned [`ci`](ci.md) treats missing slots for configured targets as **fatal** (exit `3`), not
warnings. See [lock-schema.md](../../specs/lock-schema.md) § Frozen install.

### Global scope (`-g`)

`list -g` resolves global `agents.json` (when present) and reads `agents-lock.json` under
`~/.agents-repo/` (or `AGENTS_REPO_HOME`). Missing lock: exit `0` with an empty list.
Incomplete `byTarget` warnings use the same rules as project scope, based on global
`agents.json` `targets`.

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

- [global-install-state.md](../../specs/global-install-state.md) — global scope uses project lock schema
- [lock-schema.md](../../specs/lock-schema.md) — project lock entries
- [command-contracts.md](../../specs/command-contracts.md) — `list` / `ls` surface

## See also

- [`install`](install.md) — install packages by id
- [`ci`](ci.md) — planned lockfile install for CI (post-MVP)
- [`search`](search.md) — search the registry catalog
