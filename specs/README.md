# CLI Specs

Normative CLI contracts live in this directory.

## Spec index

| Spec | Description |
| --- | --- |
| [config-schema.md](config-schema.md) | `agents.json` schema, schema gate, merge rules |
| [lock-schema.md](lock-schema.md) | `agents-lock.json` lockfile format |
| [cli-protocol.md](cli-protocol.md) | Install pipeline protocol |
| [command-contracts.md](command-contracts.md) | Flags, exit codes, environment overrides |
| [target-detection.md](target-detection.md) | Install target detection from project markers (`init`) |
| [artifact-cache.md](artifact-cache.md) | On-disk registry artifact cache under global home |
| [global-install-state.md](global-install-state.md) | Global scope lock and config persistence |
| [suggest-agents.md](suggest-agents.md) | Metadata-based package ranking for `suggest-agents` |
| [../docs/npm-cli-parity.md](../docs/npm-cli-parity.md) | npm command/alias/flag parity reference (informative) |

Use `.github/ISSUE_TEMPLATE/spec-change.yml` to propose changes.
