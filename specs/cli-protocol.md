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

This spec defines end-to-end **install** behavior for single-package and bulk commands.
Implementation is provided by the registry, config, and install modules.

## Pipeline Overview

Install MUST execute these steps in order:

1. Load config and apply environment overrides (`config-schema.md`, `command-contracts.md`).
2. Resolve registry `ref` to a concrete git ref; record in lock `resolvedRef` on save.
3. Fetch `packages/index.json` (registry `index-schema.md`).
4. Resolve package id (qualified id or index `aliases`).
5. Fetch `versions/manifest.json` (registry `manifest-schema.md`).
6. Pick version via semver range (highest satisfying; npm default).
7. Pick artifact for resolved install `target`.
8. Download target artifact ZIP.
9. Verify SHA-256 against manifest.
10. Run ZIP security scan (registry `zip-scan` conformance).
11. Extract **entire package** (all agents and flows) per registry `install-targets.md`.
12. Update `agents.json` and `agents-lock.json` (project scope only) unless `--no-save`.

`--dry-run` MUST execute through step 7 and MUST NOT download, extract, or mutate config/lock.

## Step Details

### 1. Load config

- Resolve schema gate per `config-schema.md`.
- Apply `AGENTS_REPO_REGISTRY_URL` after file resolution.
- Resolve install `target` from config, `--target` flag, or detection (init only).
- Missing `target` on install MUST exit `3`.

### 2. Resolve registry ref

`registry.ref` major-line aliases (e.g. `v2.x`) MUST resolve to a concrete ref before fetching
index or artifacts. Store the concrete value in `agents-lock.json` `resolvedRef` on lock write.

### 3. Fetch index

- Path: `packages/index.json`.
- Reject unsupported index `schemaVersion` per registry `index-schema.md`.
- Resolve leaf package ids via `aliases` when present.

### 4. Resolve package

- Match qualified package id.
- Package `status` per registry `metadata-schema.md`:
  - `yanked` → MUST reject install.
  - `deprecated` → MUST warn; MAY proceed.
  - `archived` → MUST warn; MAY proceed.
  - `active` → proceed.

### 5. Fetch manifest

- Path: `packages/<namespace>/<package>/versions/manifest.json`.
- Reject unsupported manifest `schemaVersion`.

### 6. Pick version

- Use semver range from `agents.json` `packages[<id>]` when present.
- Select the **highest** version in `manifest.versions[]` satisfying the range.
- Manifest `latest` is a catalog hint only; it MUST NOT override range logic.
- Single `install <package-id>` without a prior `packages` entry MUST add an entry (resolved
  version or range per command defaults) unless `--no-save`.

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

CLI MUST reject archives that fail conformance with the registry zip-scan validator
(`registry/scripts/lib/validators/snapshot/zip-scan.ts`). Normative baseline: `ERR_ZIP_*` error
codes from that implementation.

At minimum, tooling MUST reject archives with:

- Path traversal (`ERR_ZIP_TRAVERSAL`)
- Symlink entries (`ERR_ZIP_SYMLINK`)
- Disallowed payloads (`ERR_ZIP_DISALLOWED_PAYLOAD`)
- Unexpected entries (`ERR_ZIP_UNEXPECTED_ENTRY`)
- Duplicate entries (`ERR_ZIP_COLLISION`)

### 11. Extract

- Extract per registry `install-targets.md` ZIP layout for the chosen target.
- MVP: install the **entire package** (all agents and flows in the artifact).
- **Project scope:** extract under project root.
- **Global scope (`-g` or `global: true`):** extract under `~/.config/agents-repo/`.

### 12. Update config and lock

Project scope only (unless `--no-save`):

- Add or update `packages[<id>]` in `agents.json`.
- Add or update lock entry per `lock-schema.md`.

Global scope MUST NOT mutate project `agents.json` or `agents-lock.json`.

## Config and Lock Writes

| Invocation | Mutate `agents.json` | Mutate `agents-lock.json` |
| --- | --- | --- |
| `install <pkg>` (default) | Yes (unless `--no-save`) | Yes |
| `install <pkg> -g` | No | No |
| `install` (bulk) | Yes | Yes (unless `global: true` in config) |
| `install` (bulk, `global: true`) | Yes (`packages` map) | No |

## MVP Install Scope

`install <package-id>` installs the **entire package**. Selective install (subset of agents or
flows) is out of MVP scope. Reserved future interfaces are listed in `command-contracts.md`.

## Cross-References

- Registry: `install-targets.md`, `index-schema.md`, `manifest-schema.md`, `metadata-schema.md`
- CLI: `config-schema.md`, `lock-schema.md`, `command-contracts.md`
