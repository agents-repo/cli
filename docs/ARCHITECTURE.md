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

Normative contracts live under `specs/` (see issue #2).

## Related docs

- [architecture/ddd-decision.md](architecture/ddd-decision.md)
- [development.md](development.md)
