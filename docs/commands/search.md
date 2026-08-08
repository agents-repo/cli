# `search` command

Search the registry catalog for packages by keyword. Results mirror the webapp
home page search (`filterRegistryPackages`).

## Usage

```bash
agents-repo search [query] [options]
agents-repo find [query] [options]
agents-repo s [query] [options]
agents-repo se [query] [options]
```

With no `query`, or with a whitespace-only query, every package in the catalog
is listed (same as the webapp).

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--interactive` | search | Browse and select a package in the terminal |
| `--json` | global | Machine-readable output |
| `--verbose` | global | Log index URL, catalog date, and match count on stderr |
| `--yes` / `-y` | global | Waive dual-definition config conflicts with warnings |

## Behavior

### Registry resolution

`search` resolves `agents.json` (when present) and environment overrides, then
fetches `packages/index.json` via the registry client. No install target is
required.

### Matching

Queries are case-insensitive substring matches across:

- Qualified id (`namespace/package`)
- Package name and leaf id
- Description
- Owner (`@owner` strips the `@` prefix)
- Tags
- Catalog index `aliases` whose value resolves to the package id (leaf alias keys)

### Output

**Text (default):** one line per package:

```text
agents-repo/sample-agent@1.0.0  A sample agent package for accessibility testing.
```

Long descriptions are truncated to 72 characters in text output.

**JSON (`--json`):**

```json
{
  "query": "sample",
  "indexUrl": "https://…/packages/index.json",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "warnings": [],
  "packages": [
    {
      "id": "agents-repo/sample-agent",
      "name": "sample-agent",
      "description": "…",
      "latest": "1.0.0",
      "status": "active",
      "owner": "agents-repo"
    }
  ]
}
```

Registry and config warnings appear in the `warnings` array (JSON) or on stderr
(text).

### Interactive mode

`--interactive` requires stdin to be a TTY (stdout must also be a TTY unless
`--json` is set, so selected-id JSON can be piped). The CLI prompts with an
autocomplete list (`id — name`). On selection:

```text
Selected agents-repo/sample-agent
Install with: agents-repo install agents-repo/sample-agent
```

With `--json`, stdout is `{ "selected": "agents-repo/sample-agent" }`.

Interactive prompts and cancel messages are written to **stderr** when `--json` is
set so stdout remains a single JSON document.

Installing from interactive search is not implemented in MVP (see issue #10).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Registry/runtime failure or interactive cancel |
| `2` | Invalid usage (for example `--interactive` without TTY) |
| `3` | Config validation error |
| `4` | Config conflict without `--yes` |

## Examples

```bash
agents-repo search accessibility
agents-repo find @agents-repo --json
agents-repo search --interactive
agents-repo -y search sample
```

## See also

- [`install`](install.md) — install a package by id
- [`specs/command-contracts.md`](../../specs/command-contracts.md)
