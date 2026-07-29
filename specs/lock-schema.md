# Lock Schema Specification (1.0.0)

This document defines the deterministic `agents-lock.json` format for the agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

`lockfileVersion` identifies the lock **format** version, not the spec document version (`1.0.0`).

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `2` | lockfileVersion | current | `byTarget` map per package |

Tooling MUST support `lockfileVersion` `2` only. New lock files MUST use `lockfileVersion` `2`.
Tooling MUST reject lock files whose `lockfileVersion` is not `2` (exit `3`).

## Purpose

`agents-lock.json` records exact resolved install state (npm `package-lock.json` inspired). It
pairs with `agents.json` and SHOULD be committed to VCS.

## File Location

- Default: `agents-lock.json` in the same directory as `agents.json`.
- When `AGENTS_REPO_CONFIG` points to a custom `agents.json` path, the lock file MUST live in that
  same directory.
- The file MUST be valid UTF-8 encoded JSON.

## Top-Level Schema

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `lockfileVersion` | integer | yes | MUST be `2` for new lock files |
| `resolvedRef` | string | yes | Concrete registry git ref after alias resolution |
| `packages` | object | yes | Map qualified id → lock entry; see below |

`resolvedRef` MUST be the concrete ref (e.g. `v2.3.1`), not a major-line alias (e.g. `v2.x`).

## Package Lock Entry (lockfileVersion 2)

Each entry in `packages` MUST be an object with:

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `version` | string | yes | Exact resolved semver (`MAJOR.MINOR.PATCH`) shared by all slots |
| `byTarget` | object | yes | Map install target id → slot; see [Target slot](#target-slot) |

### Target slot

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `integrity` | string | yes | `sha256-<64-char-lowercase-hex>` |
| `artifact` | string | yes | Artifact filename (e.g. `1.0.0-cursor.zip`) |

`byTarget` keys MUST be valid install target ids. Each slot `artifact` MUST equal
`${version}-<target-id>.zip`. On write, keys SHOULD be serialized in canonical install-target order.

### Integrity format

Lock `integrity` MUST use a prefixed lowercase hex digest:

```text
sha256-<manifest-sha256-hex>
```

Where `<manifest-sha256-hex>` is the bare lowercase hex from registry `manifest.json`
`artifacts[].sha256` for the installed artifact. This is not Subresource Integrity (SRI) base64;
tooling MUST NOT re-hash with a different algorithm or encoding.

## Behavioral Rules

When merging a lock slot at a **new** package `version`, tooling MUST drop other `byTarget` slots
for that package so every remaining slot matches the shared `version` and artifact naming
(`${version}-<target-id>.zip`).

### Project scope

After a successful project-scope `install`, tooling MUST update or create `agents-lock.json` in the
same directory as `agents.json` unless `--no-save`.

When `agents.json` semver ranges allow a newer compatible version, `install` MAY update the
corresponding lock entry.

`resolvedRef` MUST be updated at lock-write time. Tooling MUST NOT write `resolved` in MVP so
identical resolution produces identical lock content.

### Global scope

Global scope (`-g`) MUST NOT modify project `agents-lock.json`. Global installs persist
`agents-lock.json` under `AGENTS_REPO_HOME` (`~/.agents-repo/` by default) with the same v2
`byTarget` shape as project scope.

| Invocation | Lock behavior |
| --- | --- |
| `install <pkg> -g` | Update global lock only |
| `install` (bulk, `-g`) | Update global lock only |

### Remove

Successful `remove <package-id>` MUST delete the lock entry for that package id. When the lock
`packages` map becomes empty, tooling MAY retain `resolvedRef` on the lock file or omit the lock
file per repository write policy; MVP writers MUST keep a valid v2 document when the lock file
remains.

| Invocation | Lock behavior |
| --- | --- |
| `remove <pkg>` | Delete package entry from project lock |
| `remove <pkg> -g` | Delete package entry from global lock only |

### Bulk install without lock

When `agents-lock.json` is missing on bulk `install`, tooling MUST resolve from `agents.json`
ranges and write the lock (project scope, or global lock under `AGENTS_REPO_HOME` when `-g` is set).

### Frozen install (post-MVP)

`agents-repo ci` (post-MVP) installs exactly from the lock without semver re-resolution. The lock
format MUST support that command; MVP does not implement it. See
[#16](https://github.com/agents-repo/cli/issues/16). Multi-target `agents.json` and lock v2
`byTarget` rules are defined in this section and in `command-contracts.md` (see
[#48](https://github.com/agents-repo/cli/issues/48)).

#### Prerequisites

- Tooling MUST read `agents-lock.json` with `lockfileVersion` `2` beside resolved project
  `agents.json` (or `AGENTS_REPO_CONFIG` override). Missing lock MUST exit `3`.
- Tooling MUST resolve `agents.json` `targets[]` from config only. `ci` MUST NOT run install-target
  detection. When `targets` is missing or empty after resolution, tooling MUST exit `3` (same as
  bulk `install` / `update`).
- Post-MVP `ci` in this spec applies to **project scope** only. Global `ci -g` is out of scope
  unless a follow-up issue extends these rules.

#### Config and lock package sets

Before any download or extract, tooling MUST validate that resolved `agents.json` `packages` and
lock `packages` describe the same set of qualified package ids:

- Every key in resolved `agents.json` `packages` MUST have a lock entry; otherwise exit `3`.
- Every key in lock `packages` MUST appear in resolved `agents.json` `packages`; otherwise exit `3`
  (config/lock drift).

This is stricter than `list`, which still enumerates lock entries when config omits a range.

#### Required `byTarget` slots (multi-target)

For each `packageId` in resolved `agents.json` `packages` and each `targetId` in resolved
`agents.json` `targets`, the lock entry `packages[packageId].byTarget[targetId]` MUST exist and
MUST satisfy the [Target slot](#target-slot) constraints for `packages[packageId].version`.

When any required slot is absent, tooling MUST exit `3` with a message that identifies the package
and target (for example `missing byTarget slot for configured target <target-id>`). This is
**fatal** on `ci`. Contrast `list`, which emits the same condition as a non-fatal warning and exits
`0`.

`byTarget` keys for install target ids **not** listed in resolved `agents.json` `targets` are not
required for `ci` validation and MUST NOT be installed by `ci`. The lock MAY retain such slots from
earlier installs; `list` MAY still show them.

#### Version and range checks

- Tooling MUST NOT semver re-resolve from `agents.json` `packages` ranges. Each install MUST use
  lock `packages[<id>].version` and the per-target `artifact` and `integrity` from the required
  `byTarget` slots.
- When resolved `packages[<id>]` range does not accept lock `version`, tooling MUST exit `3` unless
  `--force` is set (see `command-contracts.md`). `--force` MUST NOT waive missing required
  `byTarget` slots or config/lock package-set mismatch.

#### Registry and extract

- Registry fetches MUST use lock `resolvedRef` (concrete ref) together with resolved `registry.url`
  (including `AGENTS_REPO_REGISTRY_URL` override) to download the artifact named in each required
  slot. Tooling MUST verify each slot `integrity` against the downloaded bytes and run the same ZIP
  security scan as `install`.
- Extract MUST fan out across the same `(packageId, targetId)` pairs as bulk `install`: one extract
  per required slot into project scope (project cwd). `ci` MUST NOT mutate `agents.json` or
  `agents-lock.json` on success.

## Validation Rules

- `packages` keys MUST match qualified id format from `config-schema.md`.
- `packages[<id>].version` MUST be an exact semver present in the resolved manifest.
- For each `byTarget` slot, `artifact` MUST match the manifest artifact filename for the resolved
  version and install target id.
- For each `byTarget` slot, `integrity` MUST equal `sha256-` + manifest `artifacts[].sha256` for
  that artifact.

## Canonical JSON Example

```json
{
  "lockfileVersion": 2,
  "resolvedRef": "v2.3.1",
  "packages": {
    "agents-repo/hello-agent": {
      "version": "1.0.0",
      "byTarget": {
        "cursor": {
          "integrity": "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "artifact": "1.0.0-cursor.zip"
        }
      }
    }
  }
}
```

## Cross-References

- Registry: [manifest-schema.md](https://github.com/agents-repo/registry/blob/main/specs/manifest-schema.md)
- CLI: `config-schema.md`, `cli-protocol.md`, `command-contracts.md`, `global-install-state.md`
