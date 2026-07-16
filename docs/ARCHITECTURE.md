# Architecture

This document provides a high-level map of the planned CLI architecture. Module
boundaries and file mappings are expanded in issue #3.

## Planned modules

| Module | Responsibility |
| --- | --- |
| `cli` | Commander setup, command registration, global flags |
| `config` | `agents.json` and `agents-lock.json` read/write |
| `registry` | Registry index, manifest, and artifact URL resolution |
| `install` | Download, verify, extract packages per install target |
| `target` | Detect IDE/project install targets (`.cursor/`, `.github/`, etc.) |

## Layout

```text
src/modules/
  cli/
  config/
  registry/
  install/
  target/
```

Normative contracts live under `specs/`:

- [config-schema.md](../specs/config-schema.md) — `agents.json` schema and schema gate
- [lock-schema.md](../specs/lock-schema.md) — `agents-lock.json` lockfile format
- [cli-protocol.md](../specs/cli-protocol.md) — install pipeline protocol
- [command-contracts.md](../specs/command-contracts.md) — flags, exit codes, env overrides

## Related docs

- [architecture/ddd-decision.md](architecture/ddd-decision.md)
- [development.md](development.md)
