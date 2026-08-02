# `suggest-agents` command

Suggest registry packages from local project metadata (dependencies, README, and
config). Ranking is deterministic and does not use an LLM.

## Usage

```bash
agents-repo suggest-agents [options]
agents-repo suggest [options]
```

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--limit <n>` | suggest-agents | Maximum suggestions (default `10`) |
| `--json` | global | Machine-readable output |
| `--verbose` | global | Log index URL, catalog date, signal count, and match count on stderr |
| `--yes` / `-y` | global | Waive dual-definition config conflicts with warnings |

## Behavior

### Registry resolution

`suggest-agents` resolves `agents.json` (when present) and environment overrides,
then fetches `packages/index.json`. No install target is required.

### Project signals

Signals come from:

- `package.json` dependency keys and `name`
- Root `README.md` / `readme.md` / `Readme.md` tokens (length ≥ 3)
- Installed package ids from resolved `agents.json` `packages` (omitted from results)

Scoring rules are defined in [`specs/suggest-agents.md`](../../specs/suggest-agents.md).

### Output

**Text (default):** lines with score, package id@version, and truncated description
(separated by spaces).

```text
5  agents-repo/sample-agent@1.0.0  Sample description…
```

**JSON (`--json`):**

```json
{
  "indexUrl": "https://…/packages/index.json",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "warnings": [],
  "suggestions": [
    {
      "id": "agents-repo/sample-agent",
      "name": "sample-agent",
      "description": "…",
      "latest": "1.0.0",
      "status": "active",
      "owner": "agents-repo",
      "score": 5,
      "matchedSignals": ["sample"]
    }
  ]
}
```

When nothing matches, text mode prints a friendly message; JSON returns an empty
`suggestions` array. Exit code `0` in both cases.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Registry/runtime failure |
| `2` | Invalid usage (for example invalid `--limit`) |
| `3` | Config validation error |
| `4` | Config conflict without `--yes` |

## Examples

```bash
agents-repo suggest-agents
agents-repo suggest --limit 5 --json
agents-repo -y suggest-agents --verbose
```

## See also

- [`search`](search.md) — keyword search across the catalog
- [`install`](install.md) — install a suggested package by id
- [`specs/suggest-agents.md`](../../specs/suggest-agents.md)
