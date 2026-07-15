# Config Schema Specification (1.0.0)

This document defines the deterministic `agents.json` format for the agents-repo CLI.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Schema Version Lifecycle

`schemaVersion` identifies the config **format** version, not the package release version and not
the spec document version (`1.0.0`).

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1.0.0` | config schemaVersion | current | Initial release |

Tooling MUST reject config files whose top-level `schemaVersion` is not in the table above unless
it explicitly supports a newer schema version.

Lifecycle enforcement:

- Unsupported top-level `schemaVersion` values MUST trigger **namespace fallback** (see
  [Schema Gate](#schema-gate)); tooling MUST NOT treat them as top-level-ours.
- New projects MUST use `1.0.0`.

## Purpose

`agents.json` is a project-root install manifest pairing with `agents-lock.json` (npm
`package.json` / `package-lock.json` pattern). It declares registry source, install target, and
package semver ranges.

### Not web `agents.json`

Project-root `agents.json` is a **local package-install manifest**. It is unrelated to web
discovery manifests served at `/.well-known/agents.json` (actions, tools, API endpoints).

In MVP, `agents.json` MUST be stored at the project root only.

## File Location

- Default path: `./agents.json` at the project root.
- When `AGENTS_REPO_CONFIG` is set, it MUST be an absolute path to `agents.json`; see
  `command-contracts.md`.
- The file MUST be valid UTF-8 encoded JSON.

## Top-Level Canonical Schema

When the [schema gate](#schema-gate) selects top-level-ours or greenfield mode, CLI-managed fields
are:

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `schemaVersion` | string | yes | MUST be `1.0.0` for new files; see [Schema Version Lifecycle](#schema-version-lifecycle) |
| `registry` | object | yes | `{ "url": string, "ref": string }`; see [Registry](#registry) |
| `target` | string | yes for install | Install target id per registry `install-targets.md` |
| `packages` | object | yes | Map qualified id → semver range string; see [Packages](#packages) |
| `global` | boolean | no | When true, installs use global extract dir per `command-contracts.md` |

### Registry

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `url` | string | yes | Registry proxy or GitHub raw/tree URL |
| `ref` | string | yes | Git tag, branch, or major-line alias (e.g. `v2.x`) |

When `registry` is absent during resolution, tooling MUST apply this default:

```json
{
  "url": "https://registry-proxy.maiconfz.workers.dev",
  "ref": "v2.x"
}
```

`registry.url` MUST accept registry-proxy URLs and GitHub tree/raw URLs. URL normalization rules
are defined by the registry client implementation; this spec requires only that `ref` is carried
alongside `url`.

### Packages

- Keys MUST be qualified package ids:
  `^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$` (per registry `index-schema.md`).
- Values MUST be valid npm-style semver range strings.
- There MUST NOT be a `dependencies` alias for `packages`.

### Migration alias: `registryUrl`

`registryUrl` (string) MAY appear at top level (top-level-ours) or inside `"@agents-repo"` as a
read-only legacy alias for a single registry URL.

- On read, tooling MUST map `registryUrl` to `registry.url` when `registry.url` is absent.
- Tooling MUST NOT write `registryUrl` on new or updated files; canonical output uses
  `registry: { url, ref }`.

## Schema Gate

The schema gate determines where CLI-managed fields are read and written.

| Mode | Condition | Read/write target |
| --- | --- | --- |
| **greenfield** | No file, empty `{}`, or whitespace-only | Top-level canonical fields |
| **top-level-ours** | Supported `schemaVersion` at top level | Top-level canonical fields |
| **namespace** | Top-level `schemaVersion` absent or unsupported | `"@agents-repo"` block only |

Rules:

1. In **namespace** mode, tooling MUST read CLI-managed values only from `"@agents-repo"`. Top-level
   homonyms (`packages`, `target`, `registry`) MUST be treated as foreign even if present.
2. In **namespace** mode, tooling MUST NOT add top-level canonical keys.
3. Tooling MUST ignore unknown top-level keys and other `@*` namespace blocks.
4. Tooling MUST NOT mutate, rename, or delete foreign keys.

### `@agents-repo` namespace fallback

When the schema gate selects namespace mode, CLI-managed fields MUST use the same schema as
top-level canonical fields, nested under `"@agents-repo"`.

## Resolution Order

Config resolution MUST be gate-aware:

1. Determine schema gate mode.
2. Read CLI-managed fields from the active target only (top-level or `"@agents-repo"`).
3. Apply built-in defaults (`registry`, `target` when detection applies).
4. Apply environment overrides per `command-contracts.md` (`AGENTS_REPO_REGISTRY_URL` overrides
   `registry.url` only).

## Conflicts

| Code | Example | Default behavior |
| --- | --- | --- |
| `type_mismatch` | `packages` is an array in the active gate target | Exit `3` |
| `dual_definition_mismatch` | `target` differs at top level vs `"@agents-repo"` (top-level-ours only) | Exit `4` unless `--yes` |
| `invalid_enum` | `target` not in install-targets table | Exit `3` |
| `invalid_semver_range` | Invalid semver range in `packages` | Exit `3` |

`dual_definition_mismatch` applies only in **top-level-ours** mode when the same CLI-managed key is
defined incompatibly at top level and in `"@agents-repo"`.

With `--yes`, conflicts downgrade to structured warnings; tooling MAY continue and MUST exit `0`
on success.

## `init` Merge Semantics

| Condition | Behavior |
| --- | --- |
| Greenfield | Write top-level canonical file with `schemaVersion: "1.0.0"` |
| Top-level-ours | Deep-merge CLI-managed keys at top level; preserve foreign keys |
| Namespace | Write/update only `"@agents-repo"` subtree |
| `--force` | Overwrite agents-repo-managed keys in the active gate target only |

## Reserved Keys

CLI-managed field names: `schemaVersion`, `registry`, `target`, `packages`, `global`.

- **top-level-ours:** owned at top level; `"@agents-repo"` SHOULD NOT duplicate them.
- **namespace:** owned only inside `"@agents-repo"`; homonyms at top level are foreign.

## Lock File Policy

`agents-lock.json` SHOULD be committed to VCS (npm lockfile pattern). See `lock-schema.md`.
`install` updates the lock in project scope; frozen install is deferred to `agents-repo ci`.

## Validation Rules

- `packages` keys MUST be unique qualified ids.
- `target` MUST be one of the install target ids in registry `install-targets.md`.
- `global` when true applies to install extract scope per `cli-protocol.md` and
  `command-contracts.md`.
- Flag `-g` overrides config `global` for that invocation.

## Canonical JSON Example

```json
{
  "schemaVersion": "1.0.0",
  "registry": {
    "url": "https://registry-proxy.maiconfz.workers.dev",
    "ref": "v2.x"
  },
  "target": "cursor",
  "packages": {
    "agents-repo/hello-agent": "^1.0.0"
  }
}
```

## Cross-References

- Registry: `install-targets.md`, `index-schema.md`
- CLI: `lock-schema.md`, `command-contracts.md`, `cli-protocol.md`
