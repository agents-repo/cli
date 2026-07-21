# Architecture

This document provides a high-level map of the CLI architecture. Module
boundaries and webapp parity mappings are defined here and in
[architecture/ddd-decision.md](architecture/ddd-decision.md).

## Modules

| Module | Responsibility |
| --- | --- |
| `cli` | Commander setup, command registration, global flags |
| `config` | `agents.json` and `agents-lock.json` read/write |
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

## Registry module — planned webapp parity

The registry module **will be copy-adapted** from
[`webapp/src/modules/registry/`](https://github.com/agents-repo/webapp/tree/main/src/modules/registry).
There is no shared package in M0. Only module directories are scaffolded in
issue #3.

| Webapp file | CLI file | Notes |
| --- | --- | --- |
| `domain/package.ts` | `package.ts` | Catalog and package types |
| `infrastructure/registrySourceUrl.ts` | `registrySourceUrl.ts` | Index and artifact URLs |
| `infrastructure/registryMajorVersionRef.ts` | `registryMajorVersionRef.ts` | Major-line alias |
| `infrastructure/registryTagResolver.ts` | `registryTagResolver.ts` | Git tag to concrete ref |
| `infrastructure/registrySourceConfig.ts` | `registrySourceConfig.ts` | Config/env source |
| `infrastructure/registryRepository.ts` | `registryRepository.ts` | Index fetch and Node cache |
| `infrastructure/registryCatalogValidation.ts` | `registryCatalogValidation.ts` | Validation |
| `infrastructure/registryCatalogCache.ts` | `registryCatalogCache.ts` | Cache envelope for CLI |
| `application/catalogCacheState.ts` | `catalogCacheState.ts` | Cache state helpers |
| `application/registrySelectors.ts` | `registrySelectors.ts` | Catalog queries |
| `application/registrySourceSettings.ts` | `registrySourceSettings.ts` | Runtime source settings |
| `application/registrySource.ts` | `registrySource.ts` | Barrel re-exports (optional) |
| `application/installTargets.ts` | `installTargets.ts` | Install target labels |
| `presentation/*` | — | Web UI only; not ported |

CLI paths are under `src/modules/registry/` using the same layer folders as webapp
(`domain/`, `application/`, `infrastructure/`).

**Future dependency when porting registry:** `semver` (used by webapp
`registryRepository.ts`).

## Install module — webapp URL logic + CLI extensions

The webapp does not HTTP-download ZIP artifacts. It builds download URLs via
`getPackageDownloadTargets` in `homePageCatalogState.ts` and
`buildRegistryArtifactUrl` in `registrySourceUrl.ts`. The CLI will reuse those
registry helpers and add fetch, verification, and extraction per
[`specs/cli-protocol.md`](../specs/cli-protocol.md).

| Concern | Webapp reference | CLI responsibility |
| --- | --- | --- |
| Artifact URL resolution | `homePageCatalogState.ts` | Reuse registry URL helpers |
| Manifest fetch and semver pick | — | `install/application/` steps 5–7 |
| SHA-256 verify | — | `install/infrastructure/` (protocol step 9) |
| ZIP security scan | — | `install/infrastructure/` (protocol step 10) |
| Extract to target paths | — | `install/infrastructure/` per [registry install-targets](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md) |
| Config and lock writes | — | Delegates to `config/` (protocol step 12) |

### Install pipeline overview

```text
1. Load config (+ env overrides)          -> config/
2. Resolve registry ref                   -> registry/
3. Fetch packages/index.json              -> registry/
4. Resolve package id                     -> registry/
5. Fetch versions/manifest.json           -> install/application/
6. Pick version (semver)                  -> install/application/
7. Pick artifact for install target       -> install/application/
8. Download ZIP                           -> install/infrastructure/
9. Verify SHA-256                         -> install/infrastructure/
10. ZIP security scan                     -> install/infrastructure/
11. Extract package                       -> install/infrastructure/
12. Update agents.json + lock             -> config/
```

See [`specs/cli-protocol.md`](../specs/cli-protocol.md) for normative step
details.

## Normative contracts

- [config-schema.md](../specs/config-schema.md) — `agents.json` schema and schema gate
- [lock-schema.md](../specs/lock-schema.md) — `agents-lock.json` lockfile format
- [cli-protocol.md](../specs/cli-protocol.md) — install pipeline protocol
- [command-contracts.md](../specs/command-contracts.md) — flags, exit codes, env overrides

## Related docs

- [architecture/ddd-decision.md](architecture/ddd-decision.md)
- [development.md](development.md)
