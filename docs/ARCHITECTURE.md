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

## Config module (issue #5)

The config module implements schema-gated `agents.json` resolution, merge
semantics, conflict detection, environment overrides, and `agents-lock.json`
I/O per [`specs/config-schema.md`](../specs/config-schema.md) and
[`specs/lock-schema.md`](../specs/lock-schema.md). CLI commands (`init`,
`install`) consume these APIs in later issues.

### Delivered in issue #5

| Area | CLI path | Notes |
| --- | --- | --- |
| Config/lock types + validators | `config/domain/` | Schema version, lock format, qualified ids |
| Typed config errors | `config/domain/configErrors.ts` | Exit codes `3` and `4` |
| Schema gate | `config/application/schemaGate.ts` | greenfield / top-level-ours / namespace |
| Conflict detection | `config/application/conflictDetector.ts` | Conflict codes + dual_definition |
| Config resolution | `config/application/configResolver.ts` | Defaults and env overrides |
| Merge semantics | `config/application/configMerger.ts` | Gate-aware merge; foreign keys kept |
| Lock file service | `config/application/lockFileService.ts` | Validate on read; stable writes |
| File I/O | `config/infrastructure/` | `agents.json` and `agents-lock.json` repos |

Install commands (#8) pass `ResolvedAgentsConfig.registry` to
`getRegistrySourceConfig()` from the registry module (replacing the deferred
`registrySourceSettings.ts` webapp port).

## Registry module — webapp parity (issue #4)

The registry module is copy-adapted from
[`webapp/src/modules/registry/`](https://github.com/agents-repo/webapp/tree/main/src/modules/registry).
There is no shared package in M0.

### Delivered in issue #4

| Area | CLI path | Notes |
| --- | --- | --- |
| Catalog types + `resolvePackageRef` | `domain/package.ts` | No `toPackageSlug` (web UI only) |
| Manifest types | `domain/manifest.ts` | Schema 1.1.0 |
| Schema lifecycle tables | `domain/schemaVersions.ts` | Vendored registry `schema-versions.json` |
| Typed errors | `domain/errors.ts` | Throw-based registry API |
| Index/manifest URL builders | `infrastructure/registrySourceUrl.ts` | Manifest path/url helpers |
| Major-line alias | `infrastructure/registryMajorVersionRef.ts` | |
| Tag resolver | `infrastructure/registryTagResolver.ts` | In-memory TTL cache |
| Source config | `infrastructure/registrySourceConfig.ts` | `RegistryConfig` injection |
| Catalog validation | `infrastructure/registryCatalogValidation.ts` | Structural validation |
| Schema gates | `infrastructure/registrySchemaGate.ts` | Index/manifest lifecycle |
| Index + manifest fetch | `infrastructure/registryRepository.ts` | Network-only (no cache v1) |
| Manifest validation | `infrastructure/registryManifestValidation.ts` | |
| Package status policy | `application/packageStatusPolicy.ts` | yanked reject; warn deprecated |
| Catalog package resolve | `application/resolvePackageInCatalog.ts` | Qualified id + aliases |
| Artifact resolve + URLs | `application/resolveArtifact.ts` | Catalog parity + manifest URLs |

**Dependency:** `semver` (tag resolution and major-line alias handling).

### Deferred (later issues)

| Webapp file | Status |
| --- | --- |
| `registryCatalogCache.ts` | Deferred — no catalog cache v1 |
| `registrySourceSettings.ts` | Superseded by `config/` resolver output (#8) |
| `registrySelectors.ts` | Deferred — search command #10 |
| `application/installTargets.ts` | Deferred — presentation labels only |
| `presentation/*` | Not ported — web UI only |

CLI paths are under `src/modules/registry/` using `domain/`, `application/`, and
`infrastructure/`.

## Target module — install target detection (issue #6)

The target module detects IDE/project install targets from filesystem markers
for `init` suggestions per [`specs/target-detection.md`](../specs/target-detection.md).

### Delivered in issue #6

| Area | CLI path | Notes |
| --- | --- | --- |
| Detection result types | `target/domain/targetDetection.ts` | `none` / `single` / `ambiguous` |
| Detection errors | `target/domain/targetDetectionErrors.ts` | Exit `3` on bad root |
| Marker table + evaluation | `target/domain/installTargetMarkers.ts` | Marker table + OR eval |
| Detector service | `target/application/projectTargetDetector.ts` | Caller-supplied `projectRoot` |
| Filesystem probe | `target/infrastructure/markerProbe.ts` | File/dir `stat` checks |

`init` (#7) consumes `ProjectTargetDetector`; install and `ConfigResolver` do not
invoke detection implicitly. Unreadable marker paths are skipped silently; a
`none` result may therefore hide present-but-inaccessible markers—`init` should
warn in verbose mode when appropriate.

## Install module — webapp URL logic + CLI extensions

The webapp does not HTTP-download ZIP artifacts. It builds download URLs via
`getPackageDownloadTargets` in `homePageCatalogState.ts` and
`buildRegistryArtifactUrl` in `registrySourceUrl.ts`. The CLI reuses those
registry helpers (see `application/resolveArtifact.ts`) and will add download,
verification, and extraction per [`specs/cli-protocol.md`](../specs/cli-protocol.md).

| Concern | Webapp reference | CLI responsibility |
| --- | --- | --- |
| Artifact URL resolution | `homePageCatalogState.ts` | `registry/application/resolveArtifact.ts` |
| Manifest fetch + validation | — | `registry/infrastructure/registryRepository.ts` (issue #4) |
| Semver version pick | — | `install/application/` (issue #8) |
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
5. Fetch versions/manifest.json           -> registry/ (issue #4)
6. Pick version (semver)                  -> install/application/ (issue #8)
7. Pick artifact for install target       -> registry/application/ + install/
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
- [target-detection.md](../specs/target-detection.md) — install target detection (`init`)

## Related docs

- [architecture/ddd-decision.md](architecture/ddd-decision.md)
- [development.md](development.md)
