# CLI Install Protocol Specification (1.0.0)

This document defines the normative install pipeline for the agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1.0.0` | spec document version | current | Initial release |

## Purpose

This spec defines end-to-end **install** behavior for single-package, bulk, and `update` commands.
Implementation is provided by the registry, config, and install modules.

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
- Greenfield `install <package-id>` (no file or `{}` only) MAY run target detection before fan-out;
  bulk `install` / `update` MUST NOT run detection.
- Missing resolved targets on bulk `install` / `update` MUST exit `3`.
- `install` and `update` MUST fan out across all resolved targets (targets × packages).

### 2. Resolve registry ref

`registry.ref` major-line aliases (e.g. `v2.x`) MUST resolve to a concrete ref before fetching
index or artifacts. Store the concrete value in `agents-lock.json` `resolvedRef` on lock write.

### 3. Fetch index

- Path: `packages/index.json`.
- Reject unsupported index `schemaVersion` per registry `index-schema.md`.
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
- Reject unsupported manifest `schemaVersion`.

### 6. Pick version

- When `packages[<id>]` is present in the active gate target, use that semver range.
- Select the **highest** version in `manifest.versions[]` satisfying the range.
- When `packages[<id>]` is absent (ad-hoc `install <package-id>`), select the **highest** version in
  `manifest.versions[]` with no range filter (npm `install <pkg>` latest semantics).
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

### 9. SHA-256 verify

Downloaded bytes MUST match `artifacts[].sha256` (bare lowercase hex) from the manifest entry.

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
| `ci` (post-MVP, project) | Project cwd | No | No |

With `--no-save` or `--dry-run`, all rows skip config and lock writes. Global-scope rows MUST NOT
touch project config or lock files.

## Frozen install (`ci`, post-MVP)

`agents-repo ci` follows the install pipeline through config and lock load, then uses lock v2
`byTarget` slots instead of semver resolution from `agents.json` ranges:

1. Load config (with env overrides) and read `agents-lock.json`.
2. Validate config/lock package sets and required `byTarget` slots per `lock-schema.md`.
3. Optionally verify each lock `version` satisfies the resolved `packages[<id>]` range unless
   `--force`.
4. For each required `(packageId, targetId)` pair, download the slot `artifact`, verify
   `integrity`, run ZIP security scan, and extract (same steps as `install` after artifact
   selection).

`ci` MUST NOT run install-target detection and MUST NOT pick versions from manifest ranges. MVP does
not implement `ci`; see `command-contracts.md` and [#16](https://github.com/agents-repo/cli/issues/16).

## MVP Install Scope

`install <package-id>` installs the **entire package**. Selective install (subset of agents or
flows) is out of MVP scope. Reserved future interfaces are listed in `command-contracts.md`.

## Cross-References

- Registry:
  [install-targets.md](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md),
  [index-schema.md](https://github.com/agents-repo/registry/blob/main/specs/index-schema.md),
  [manifest-schema.md](https://github.com/agents-repo/registry/blob/main/specs/manifest-schema.md),
  [metadata-schema.md](https://github.com/agents-repo/registry/blob/main/specs/metadata-schema.md),
  [package-format.md](https://github.com/agents-repo/registry/blob/main/specs/package-format.md)
- CLI: `config-schema.md`, `lock-schema.md`, `command-contracts.md`
