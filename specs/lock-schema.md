# Lock Schema Specification (1.0.0)

This document defines the deterministic `agents-lock.json` format for the agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

`lockfileVersion` identifies the lock **format** version, not the spec document version (`1.0.0`).

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1` | lockfileVersion | read-only | Flat per-package entry (`target`, `integrity`, `artifact`) |
| `2` | lockfileVersion | current | `byTarget` map per package; write format |

Tooling MUST read `lockfileVersion` `1` and `2`. New lock files MUST use `lockfileVersion` `2`.
Tooling MUST reject lock files whose `lockfileVersion` is outside its supported set (exit `3`).

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

`byTarget` keys MUST be valid install target ids. On write, keys SHOULD be serialized in canonical
install-target order.

### lockfileVersion 1 (read-only)

v1 entries used flat fields `target`, `integrity`, and `artifact` at the package entry level.
On read, tooling MUST normalize v1 entries into v2 `byTarget` shape in memory and write v2 on save.

Legacy v1 fields at package level (read-only):

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `version` | string | yes | Exact resolved semver (`MAJOR.MINOR.PATCH`) |
| `target` | string | yes | Install target id used for this install |
| `integrity` | string | yes | `sha256-<64-char-lowercase-hex>` |
| `artifact` | string | yes | Artifact filename (e.g. `1.0.0-cursor.zip`) |
| `resolved` | string | no | RFC 3339 last-resolution timestamp; omitted in MVP for lock stability |

### Integrity format

Lock `integrity` MUST use a prefixed lowercase hex digest:

```text
sha256-<manifest-sha256-hex>
```

Where `<manifest-sha256-hex>` is the bare lowercase hex from registry `manifest.json`
`artifacts[].sha256` for the installed artifact. This is not Subresource Integrity (SRI) base64;
tooling MUST NOT re-hash with a different algorithm or encoding.

## Behavioral Rules

### Project scope

After a successful project-scope `install`, tooling MUST update or create `agents-lock.json` in the
same directory as `agents.json` unless `--no-save`.

When `agents.json` semver ranges allow a newer compatible version, `install` MAY update the
corresponding lock entry.

`resolvedRef` MUST be updated at lock-write time. Tooling MUST NOT write `resolved` in MVP so
identical resolution produces identical lock content.

### Global scope

Global extract scope (`-g` or resolved `global: true`) MUST NOT modify project `agents-lock.json`.
There is no project global lockfile in MVP (npm `install -g` parity). Global install metadata
is recorded in `agents-global.json` per `global-install-state.md`; that file is not a substitute
for the project lock and is used by `list -g`.

| Invocation | Lock behavior |
| --- | --- |
| `install <pkg> -g` | No project lock write |
| `install <pkg>` with `global: true` (no `-g`) | No project lock write |
| `install` (bulk, `global: true`) | No project lock write |

Bulk `install` when `global: true` is set in config: extract globally, update `agents.json`
`packages` if needed, do not update the project lock. Config and lock may temporarily diverge until
a project-scope install reconciles the lock.

### Bulk install without lock

When `agents-lock.json` is missing on bulk `install`, tooling MUST resolve from `agents.json`
ranges and write the lock (project scope, unless `global: true`).

### Frozen install (post-MVP)

`agents-repo ci` (post-MVP) installs exactly from the lock without semver re-resolution. The lock
format MUST support that command; MVP does not implement it. See issue #16.

## Validation Rules

- `packages` keys MUST match qualified id format from `config-schema.md`.
- `packages[<id>].version` MUST be an exact semver present in the resolved manifest.
- `packages[<id>].artifact` MUST match the manifest artifact filename for the resolved version and
  target.
- `packages[<id>].integrity` MUST equal `sha256-` + manifest `artifacts[].sha256` for that artifact.

## Canonical JSON Example

```json
{
  "lockfileVersion": 1,
  "resolvedRef": "v2.3.1",
  "packages": {
    "agents-repo/hello-agent": {
      "version": "1.0.0",
      "target": "cursor",
      "integrity": "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "artifact": "1.0.0-cursor.zip"
    }
  }
}
```

## Cross-References

- Registry: [manifest-schema.md](https://github.com/agents-repo/registry/blob/main/specs/manifest-schema.md)
- CLI: `config-schema.md`, `cli-protocol.md`, `command-contracts.md`, `global-install-state.md`
