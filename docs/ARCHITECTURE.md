# Architecture

This document provides a high-level map of the CLI architecture. Module
boundaries and webapp parity mappings are defined here and in
[architecture/ddd-decision.md](architecture/ddd-decision.md).

## Modules

| Module | Responsibility |
| --- | --- |
| `cli` | Commander setup, command registration, global flags |
| `config` | `agents.json`, `agents-lock.json`, and global home config I/O |
| `registry` | Registry index, manifest, and artifact URL resolution |
| `install` | Download, verify, extract packages per install target |
| `target` | Detect IDE/project install targets (`.cursor/`, `.github/`, etc.) |

## Layout

```text
src/
  bin/                 # CLI entrypoint (compiled to dist/bin/)
  modules/
    cli/
      application/     # Global CLI state (json, verbose)
      presentation/    # Commander program and command registration
    config/
      domain/
      application/
      infrastructure/
    registry/
      domain/
      application/
      infrastructure/
    install/
      domain/
      application/
      infrastructure/
    target/
      domain/
      application/
      infrastructure/
```

Command definitions live only in `cli/presentation/`. Other modules expose
application and infrastructure APIs consumed by commands.

## Current capabilities

- **Config:** Schema-gated `agents.json` with `targets[]`, merge/conflict detection,
  `agents-lock.json` at **lockfileVersion 2** (`byTarget` per package). Deprecated managed field
  `target` and unsupported lock versions exit `3`.
- **Init:** Variadic `--targets` / `--target` alias; `init -g` for global home; ambiguous detection
  persists all detected ids.
- **Install / update / remove:** Fan-out across configured `targets[]` (targets × packages);
  global `-g` uses `~/.agents-repo/` config + lock. `remove` uses lock slots to delete files.
- **add-target:** Append install target ids to project `agents.json`.
- **List:** One row per installed `(package, target)` from project or global lock.
- **Targets:** Read-only `targets[]` from resolved `agents.json` (project or global scope).
- **Registry:** Copy-adapted from webapp (`src/modules/registry/`); catalog search via
  `search`.
- **Target detection:** Filesystem markers for `init` and greenfield `install <package-id>`.

Install commands pass `ResolvedAgentsConfig.registry` to `resolveRegistryFetchSourceConfig()`.

Registry module layout: `domain/`, `application/`, `infrastructure/` under
`src/modules/registry/`. See webapp mapping in [architecture/ddd-decision.md](architecture/ddd-decision.md).

## Normative contracts

- [global-install-state.md](../specs/global-install-state.md) — global scope uses project lock schema
- [config-schema.md](../specs/config-schema.md) — `agents.json` schema and schema gate
- [lock-schema.md](../specs/lock-schema.md) — `agents-lock.json` lockfile format
- [cli-protocol.md](../specs/cli-protocol.md) — install pipeline protocol
- [command-contracts.md](../specs/command-contracts.md) — flags, exit codes, env overrides
- [target-detection.md](../specs/target-detection.md) — install target detection (`init`)

## Related docs

- [commands/init.md](commands/init.md) — `init` command usage
- [commands/install.md](commands/install.md) — `install` command usage
- [commands/update.md](commands/update.md) — `update` command usage
- [commands/remove.md](commands/remove.md) — `remove` command usage
- [commands/list.md](commands/list.md) — `list` command usage
- [commands/targets.md](commands/targets.md) — `targets` command usage
- [architecture/ddd-decision.md](architecture/ddd-decision.md)
- [development.md](development.md)
