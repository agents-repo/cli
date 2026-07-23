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
[`specs/lock-schema.md`](../specs/lock-schema.md). The `init` command (#7) and
`install` command (#8) consume these APIs.

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

### Delivered in issue #7 (`init`)

| Area | CLI path | Notes |
| --- | --- | --- |
| Init orchestration | `config/application/initService.ts` | Gate, conflicts, target, merge, write |
| Init result type | `config/domain/initResult.ts` | Success payload for command output |
| `init` command | `cli/presentation/initCommand.ts` | Commander wiring |
| CLI error mapping | `cli/presentation/cliErrorHandling.ts` | Typed errors → exit codes |
| Root `--yes` / `-y` | `cli/presentation/createCliProgram.ts` | Global conflict waiver |

Product documentation: [commands/init.md](commands/init.md).

### Delivered in issue #8 (`install`)

| Area | CLI path | Notes |
| --- | --- | --- |
| Install orchestration | `install/application/installService.ts` | Full pipeline per protocol |
| Version pick | `install/application/resolveInstallVersion.ts` | Semver range + ad-hoc pick |
| Target validation | `install/application/validateInstallTarget.ts` | Index, metadata, manifest |
| Lock ref resolution | `install/application/resolveLockRef.ts` | Concrete ref for lock writes |
| Extract scope | `install/application/installScope.ts` | Project vs global paths |
| Persistence | `install/application/installPersistence.ts` | Config + lock updates |
| Download / verify / scan / extract | `install/infrastructure/` | ZIP pipeline + path remap |
| Version metadata fetch | `registry/infrastructure/registryRepository.ts` | `loadPackageMetadata` |
| `install` command | `cli/presentation/installCommand.ts` | Commander wiring |
| Global `--dry-run` / `--no-save` | `cli/presentation/createCliProgram.ts` | Root install flags |

Product documentation: [commands/install.md](commands/install.md).

Install commands pass `ResolvedAgentsConfig.registry` to
`resolveRegistryFetchSourceConfig()` from the registry module (replacing the deferred
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

`init` (#7) consumes `ProjectTargetDetector` via `InitService`; install and
`ConfigResolver` do not invoke detection implicitly. Unreadable marker paths
are skipped silently; a `none` result may therefore hide present-but-inaccessible
markers—`init` adds marker detail in verbose mode when detection is ambiguous.

## Install module — download, verify, extract (issue #8)

The webapp does not HTTP-download ZIP artifacts. It builds download URLs via
`getPackageDownloadTargets` in `homePageCatalogState.ts` and
`buildRegistryArtifactUrl` in `registrySourceUrl.ts`. The CLI reuses those
registry helpers (see `application/resolveArtifact.ts`) and adds download,
verification, and extraction per [`specs/cli-protocol.md`](../specs/cli-protocol.md).

| Concern | Webapp reference | CLI responsibility |
| --- | --- | --- |
| Artifact URL resolution | `homePageCatalogState.ts` | `registry/application/resolveArtifact.ts` |
| Manifest + metadata fetch | — | `registry/infrastructure/registryRepository.ts` |
| Semver version pick | — | `install/application/resolveInstallVersion.ts` |
| SHA-256 verify | — | `install/infrastructure/sha256Verifier.ts` |
| ZIP security scan | — | `install/infrastructure/zipSecurityScanner.ts` |
| Extract to target paths | — | `install/infrastructure/packageExtractor.ts` |
| Config and lock writes | — | `install/application/installPersistence.ts` |

**Dependencies:** `adm-zip` (extract), `gray-matter` (agent frontmatter scan), `semver`
(version pick and registry ref resolution).

### Install pipeline overview

```text
1. Load config (+ env overrides)          -> config/
2. Resolve registry ref                   -> registry/
3. Fetch packages/index.json              -> registry/
4. Resolve package id                     -> registry/
5. Fetch versions/manifest.json           -> registry/ (issue #4)
6. Pick version (semver)                  -> install/application/
7. Pick artifact for install target       -> registry/application/ + install/
8. Download ZIP                           -> install/infrastructure/
9. Verify SHA-256                         -> install/infrastructure/
10. ZIP security scan                     -> install/infrastructure/
11. Extract package                       -> install/infrastructure/
12. Update agents.json + lock             -> config/ + install/application/
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

- [commands/init.md](commands/init.md) — `init` command usage
- [commands/install.md](commands/install.md) — `install` command usage
- [architecture/ddd-decision.md](architecture/ddd-decision.md)
- [development.md](development.md)
