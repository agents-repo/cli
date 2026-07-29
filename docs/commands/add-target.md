# `add-target` command

Append one or more install target ids to `agents.json` `targets[]` (project scope).

## Usage

```bash
agents-repo add-target <id...> [options]
```

## Flags

| Flag | Description |
| --- | --- |
| `--yes` / `-y` | Waive dual-definition mismatches with warnings |

## Behavior

- Requires an existing project `agents.json` (run `init` or greenfield `install <package-id>` first).
- New ids are merged into `targets[]` in canonical order.
- Duplicate ids: exit `0`, emit a warning, no file write.

Inspect current targets with **`agents-repo targets`**.

## Related specs

- [command-contracts.md](../../specs/command-contracts.md)
- [config-schema.md](../../specs/config-schema.md)
