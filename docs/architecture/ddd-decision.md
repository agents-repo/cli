# Architecture and DDD Decision

## Decision

Use a modular, DDD-inspired layout under `src/modules/` with feature-centric
boundaries. Each module keeps domain, application, infrastructure, and
presentation concerns separated when those layers are useful.

## Planned module boundaries

- `src/modules/cli/` — CLI program setup and command registration
- `src/modules/config/` — `agents.json` and lock file services
- `src/modules/registry/` — registry client (ported from webapp)
- `src/modules/install/` — download, verify, and extract packages
- `src/modules/target/` — project target detection

## Status

This is a bootstrap stub. Empty module directories, commander selection, and
detailed boundary rules are delivered in issue #3.

## Related docs

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [development.md](../development.md)
