# CLI Install Protocol Specification (1.1.0)

This document defines the normative install pipeline for the agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1.1.0` | spec document version | current | Forward-compatible registry schemaVersion gate |
| `1.0.0` | spec document version | supported | Initial release |

## Purpose

This spec defines end-to-end **install** behavior for variadic ad-hoc installs, bulk sync, and
`update` commands.
Implementation is provided by the registry, config, and install modules.

## Runtime requirements

The published npm package declares supported Node.js versions in `package.json` `engines.node`
(currently Node.js **22.x** and **24.x** LTS with minimum patch **22.12.0**). End users running
`npx agents-repo` or adding the CLI as a dependency SHOULD use a Node version that satisfies that
range. Contributor toolchain pins (`.nvmrc`, `packageManager`) are documented in
[`docs/development.md`](../docs/development.md) and are not part of this install protocol.

## Update command

`update` and `update <package-id>` MUST execute the same pipeline steps as bulk `install` for
configured `packages` entries only. When `<package-id>` is omitted, all configured packages are
processed. When `<package-id>` is provided, only that package is processed after validating it
exists in `agents.json` `packages`. See `command-contracts.md` for flags and exit codes.

## Install Scope

**Project scope** (default): extract under the project root; update `agents.json` and
`agents-lock.json` unless `--no-save`.

**Global scope** (`-g`): resolve config and lock under `~/.agents-repo/` (or `AGENTS_REPO_HOME`);
extract under that directory. Project `agents.json` / `agents-lock.json` MUST NOT be modified when
`-g` is set.

Global scope applies only when `--global` / `-g` is passed.

## Pipeline Overview

Install MUST execute these steps in order:

1. Load config and apply environment overrides (`config-schema.md`, `command-contracts.md`).
2. Resolve registry `ref` to a concrete git ref; record in lock `resolvedRef` on save.
3. Fetch `packages/index.json` ([registry index-schema](https://github.com/agents-repo/registry/blob/main/specs/index-schema.md)).
4. Resolve package id (qualified id or index `aliases`).
5. Fetch `versions/manifest.json` ([registry manifest-schema](https://github.com/agents-repo/registry/blob/main/specs/manifest-schema.md)).
6. Pick version via semver range (highest satisfying; npm default).
7. Pick artifact for resolved install `target`.
8. Download target artifact ZIP.
9. Verify SHA-256 against manifest.
10. Run ZIP security scan (registry `zip-scan` conformance).
11. Extract **entire package** (all agents and flows) per registry `install-targets.md`.
12. Update `agents.json` and `agents-lock.json` per [install scope](#install-scope) unless
    `--no-save` or `--dry-run`.

`--dry-run` MUST execute through step 7 and MUST NOT download, extract, or mutate config/lock.

## Step Details

### 1. Load config

- Resolve schema gate per `config-schema.md`.
- Apply `AGENTS_REPO_REGISTRY_URL` after file resolution.
- Resolve install `targets` from config `targets` only (`install` / `update` MUST NOT accept
  `--target`).
- Greenfield `install <package-id>...` (no file or `{}` only) MAY run target detection before fan-out;
  bulk `install` / `update` MUST NOT run detection.
- Missing resolved targets on bulk `install` / `update` MUST exit `3`.
- `install` and `update` MUST fan out across all resolved targets (targets × packages).

### 2. Resolve registry ref

`registry.ref` major-line aliases (e.g. `v2.x`) MUST resolve to a concrete ref before fetching
index or artifacts. Store the concrete value in `agents-lock.json` `resolvedRef` on lock write.

### 3. Fetch index

- Path: `packages/index.json`.
- Classify index `schemaVersion` against the vendored lifecycle in
  `src/modules/registry/domain/schemaVersions.ts` (`current`, `supported`, `deprecated`,
  `eol`) **before** treating the document as fatal. The allowlist remains explicit;
  unknown same-major newer versions are a forward-compat safety net until the next CLI
  release updates those constants.
  - Versions in `eol` MUST be rejected with `index_schema_error`.
  - Versions in `supported` or `deprecated` MUST proceed. Deprecated versions SHOULD
    warn with `Index schemaVersion "<ver>" is deprecated; consider upgrading catalog
    consumers`.
  - Unknown versions whose major matches vendored `current` **and** that are
    semver-greater than `current` MUST NOT fail solely because the version string is
    unknown, **if** the payload still validates against the latest supported catalog
    schema (unknown fields ignored). The CLI MUST warn with
    `Index schemaVersion "<ver>" is newer than this CLI; consider upgrading
    agents-repo`.
  - Unknown versions with a **different major** than vendored `current` MUST be
    rejected with `index_schema_error`.
  - Unknown versions that are not a same-major newer bump (malformed, older-but-unlisted)
    MUST be rejected with `index_schema_error`.
  - If a same-major newer document **fails** latest-supported structural validation, the
    CLI MUST reject it (generic catalog schema mismatch). That is a breaking payload,
    not an additive bump.
- When `schemaVersion` is a present string, classify it **before** structural catalog
  validation so callers see `Unsupported index schemaVersion` for eol, other-major,
  malformed, and older-unlisted versions, not a generic catalog mismatch when the
  version itself is the problem. A missing or non-string `schemaVersion` remains a
  generic catalog schema mismatch.
- Example: vendored current `1.4.0`. Registry publishes `1.5.0` with an extra optional
  field and a valid `1.4.0` required field set. Install MUST warn and proceed. Registry
  publishes `2.0.0`, or a `1.5.0` document missing `owner`. Install MUST fail.
- Resolve leaf package ids via `aliases` when present.

### 4. Resolve package

- Match qualified package id.
- Package `status` per [registry metadata-schema](https://github.com/agents-repo/registry/blob/main/specs/metadata-schema.md):
  - `yanked` → MUST reject install.
  - `deprecated` → MUST warn; MAY proceed.
  - `archived` → MUST warn; MAY proceed.
  - `active` → proceed.

### 5. Fetch manifest

- Path: `packages/<namespace>/<package>/versions/manifest.json`.
- Classify manifest `schemaVersion` against the vendored lifecycle in
  `src/modules/registry/domain/schemaVersions.ts` **before** treating the document as
  fatal, using the same classified gate as fetch-index.
  - Versions in `eol` MUST be rejected with `manifest_schema_error`.
  - Versions in `supported` or `deprecated` MUST proceed. Deprecated versions SHOULD
    warn.
  - Unknown versions whose major matches vendored `current` **and** that are
    semver-greater than `current` MUST NOT fail solely because the version string is
    unknown, **if** the payload still validates against the latest supported manifest
    schema (unknown fields ignored). The CLI MUST warn with
    `Manifest schemaVersion "<ver>" is newer than this CLI; consider upgrading
    agents-repo`.
  - Unknown versions with a **different major** than vendored `current` MUST be
    rejected with `manifest_schema_error`.
  - Unknown versions that are not a same-major newer bump (malformed, older-but-unlisted)
    MUST be rejected with `manifest_schema_error`.
  - If a same-major newer document **fails** latest-supported structural validation, the
    CLI MUST reject it (generic manifest schema mismatch).
- When `schemaVersion` is a present string, classify it **before** structural manifest
  validation so callers see `Unsupported manifest schemaVersion` for eol, other-major,
  malformed, and older-unlisted versions. A missing or non-string `schemaVersion`
  remains a generic manifest schema mismatch.
- Example: vendored current `1.2.0`. Registry publishes `1.3.0` with an extra optional
  version-entry field. Install MUST warn and proceed. Manifest `1.0.0` (`eol`) MUST
  fail.

### 6. Pick version

- When `packages[<id>]` is present in the active gate target, use that semver range.
- Select the **highest** version in `manifest.versions[]` satisfying the range.
- When `packages[<id>]` is absent (ad-hoc `install <package-id>...`), select the **highest**
  version in `manifest.versions[]` with no range filter (npm `install <pkg>` latest semantics).
- Manifest `latest` is a catalog hint only; it MUST NOT override the selection rules above.
- Config writes for ad-hoc installs occur in step 12 per [install scope](#install-scope).

### 7. Pick artifact

- Select `artifacts[]` entry where `target` matches the resolved install target.
- Package `installTargets` / metadata `compatibility.targets` MUST include the target and MUST
  NOT be `planned`.

### 8. Download

Artifact URL path:

```text
packages/<namespace>/<package>/versions/<version>/<artifact-file>
```

Base URL comes from resolved `registry.url` and `registry.ref`.

Before network fetch, tooling SHOULD read verified artifact bytes from the on-disk cache per
[`artifact-cache.md`](artifact-cache.md) unless `AGENTS_REPO_NO_CACHE` is set or `--prefer-online`
is passed. Cache lookup uses the expected SHA-256 hex from the manifest entry or lock slot.

Network fetch of artifact bytes MUST retry transient `registry_fetch_error` failures (including
HTTP 522) per [`artifact-cache.md`](artifact-cache.md) (3 attempts, 2s then 4s backoff). Abort
MUST NOT be retried. SHA-256 verification in step 9 MUST run once on the successful payload and
MUST NOT be retried as a fetch.

### 9. SHA-256 verify

Downloaded or cached bytes MUST match `artifacts[].sha256` (bare lowercase hex) from the manifest
entry (or lock slot integrity). Verification MUST occur in the download/cache layer once per
successful path; see [`artifact-cache.md`](artifact-cache.md).

### 10. ZIP security scan

CLI MUST reject archives that fail registry artifact security validation per
[registry package-format](https://github.com/agents-repo/registry/blob/main/specs/package-format.md)
(`package:validate-artifacts` workflow). `ERR_ZIP_*` codes from the registry zip-scan validator
are the canonical rejection labels.

At minimum, tooling MUST reject archives with:

- Path traversal (`ERR_ZIP_TRAVERSAL`)
- Symlink entries (`ERR_ZIP_SYMLINK`)
- Disallowed payloads (`ERR_ZIP_DISALLOWED_PAYLOAD`)
- Unexpected entries (`ERR_ZIP_UNEXPECTED_ENTRY`)
- Duplicate entries (`ERR_ZIP_COLLISION`)

### 11. Extract

- Extract per [registry install-targets](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md)
  ZIP layout for the chosen target.
- MVP: install the **entire package** (all agents and flows in the artifact).
- **Project scope:** extract under project root.
- **Global scope:** extract under `~/.agents-repo/` (or `AGENTS_REPO_HOME`).
- For each mapped archive file path, tooling MUST compare on-disk SHA-256 to the incoming ZIP entry
  bytes when the destination already exists:
  - When digests match, tooling MUST skip writing that path (idempotent reinstall).
  - When digests differ and the resolved install `version` differs from the lock entry for that
    package (or no lock entry exists), tooling MUST overwrite the file (`install` / `update`).
  - When digests differ at the **same** resolved version as the lock, `install` and `update` MUST
    exit `1` with structured code `extract_modified` unless `--force` is set; with `--force`, tooling
    MUST overwrite modified managed files.
- Frozen `ci` extract MUST skip when digests match and MUST overwrite when digests differ (reproduce
  lock artifact). This policy is independent of `ci --force` (lock range waiver only).

### 12. Update config and lock

Behavior depends on [install scope](#install-scope). Skip when `--no-save` or `--dry-run`:

**Project scope**:

- Write CLI-managed fields to the active schema gate target per `config-schema.md` (top-level for
  greenfield/top-level-ours; `"@agents-repo"` only for namespace mode).
- On greenfield file create, MUST persist `schemaVersion: "1.0.0"`, resolved `registry`, resolved
  `targets`, and `packages`.
- Add or update lock entry per `lock-schema.md` (v2 `byTarget`; merge per target slot).

**Global scope** (when `-g` is set):

- Write CLI-managed fields to global `agents.json` under `AGENTS_REPO_HOME`.
- Add or update global `agents-lock.json` beside global `agents.json`.
- MUST NOT mutate project `agents.json` or `agents-lock.json`.

## Config and Lock Writes

Unless `--no-save` or `--dry-run`, config and lock mutation follows:

| Invocation | Extract scope | Mutate scope `agents.json` | Mutate scope `agents-lock.json` |
| --- | --- | --- | --- |
| `install <pkg>` (project) | Project cwd | Yes | Yes |
| `install <pkg> -g` | Global home | Yes (global) | Yes (global) |
| `install` (bulk, project) | Project cwd | Yes | Yes |
| `install` (bulk, `-g`) | Global home | Yes (global) | Yes (global) |
| `update` (project) | Project cwd | Yes | Yes |
| `update` (bulk, `-g`) | Global home | Yes (global) | Yes (global) |
| `remove <pkg>` (project) | Project cwd | Yes | Yes |
| `remove <pkg> -g` | Global home | Yes (global) | Yes (global) |
| `ci` (project) | Project cwd | No | No |

With `--no-save` or `--dry-run`, all rows skip config and lock writes. Global-scope rows MUST NOT
touch project config or lock files.

## Frozen install (`ci`)

`agents-repo ci` follows the install pipeline through config and lock load, then uses lock v2
`byTarget` slots instead of semver resolution from `agents.json` ranges:

1. Load config (with env overrides) and read `agents-lock.json`.
2. Validate config/lock package sets and required `byTarget` slots per `lock-schema.md`.
3. Optionally verify each lock `version` satisfies the resolved `packages[<id>]` range unless
   `--force`.
4. For each required `(packageId, targetId)` pair, download the slot `artifact`, verify
   `integrity`, run ZIP security scan, and extract using the frozen-install extract policy in
   [step 11](#11-extract) (skip matching bytes; overwrite on mismatch).

`ci` MUST NOT run install-target detection and MUST NOT pick versions from manifest ranges. See
`command-contracts.md` and [#16](https://github.com/agents-repo/cli/issues/16).

## Remove command

`remove <package-id>` uninstalls a package that is listed in `agents.json` `packages` and
`agents-lock.json`. Tooling MUST NOT re-resolve semver ranges from `agents.json`; it MUST use lock
`packages[<id>].version` and each `byTarget` slot's `artifact` and `integrity`.

Remove MUST execute these steps in order:

1. Load config and lock for [install scope](#install-scope) (`-g` uses global home paths).
2. Validate `<package-id>` resolves to a catalog id present in `agents.json` `packages` and lock
   `packages` (exit `3` when missing).
3. Load registry catalog using lock `resolvedRef` (not config alias refs).
4. For each `byTarget` slot on the lock entry:
   - Build artifact URL for the locked version and `artifact` filename.
   - Download the ZIP (including under `--dry-run` when enumerating paths).
   - Verify SHA-256 against lock `integrity` (`sha256-<hex>`).
   - List on-disk paths using the same ZIP entry mapping as install extract
     (registry `install-targets.md` uninstall semantics).
   - Unless `--dry-run`, delete listed files with orphan-safe rules (warn on missing or modified
     files; `--force` MAY delete modified files).
5. Unless `--no-save` or `--dry-run`, remove `packages[<id>]` from `agents.json` and delete the lock
   entry. Global scope MUST NOT modify project config or lock. Tooling MUST NOT update config or
   lock when any target reports a blocking skip (modified file without `--force`, non-file path, or
   missing digest for a planned path).

`--dry-run` MUST NOT delete files or mutate config/lock. `--no-save` MUST delete files but MUST NOT
write `agents.json` or `agents-lock.json`. When a later target fails after earlier targets were
deleted, tooling MUST restore deleted files from the locked artifact ZIP before surfacing the error.
Config MUST be updated before the lock file on successful persistence.

## Install scope

`install <package-id>...` installs the **entire package** (all agents and flows in the target
artifact). Partial install of individual agents or flows (colon selector syntax or `--agents` /
`--flows` flags) was considered in [#19](https://github.com/agents-repo/cli/issues/19) and
[#20](https://github.com/agents-repo/cli/issues/20) and **dropped** to keep lock, config, and
on-disk paths consistent. See [`command-contracts.md` — Dropped interfaces](command-contracts.md#dropped-interfaces-not-planned).

## Cross-References

- Registry:
  [install-targets.md](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md),
  [index-schema.md](https://github.com/agents-repo/registry/blob/main/specs/index-schema.md),
  [manifest-schema.md](https://github.com/agents-repo/registry/blob/main/specs/manifest-schema.md),
  [metadata-schema.md](https://github.com/agents-repo/registry/blob/main/specs/metadata-schema.md),
  [package-format.md](https://github.com/agents-repo/registry/blob/main/specs/package-format.md)
- CLI: `config-schema.md`, `lock-schema.md`, `command-contracts.md`
