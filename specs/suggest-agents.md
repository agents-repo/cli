# Suggest Agents Specification (1.0.0)

This document defines deterministic `suggest-agents` behavior: ranking registry
packages from local project metadata without LLM or external inference services.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted
as described in RFC 2119.

## Schema Version Lifecycle

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1.0.0` | spec document version | current | Initial release |

## Purpose

Help users discover relevant registry packages by scoring catalog entries against
signals from the current working directory (`package.json`, README, and resolved
`agents.json`).

## Command Surface

| Command | Alias |
| --- | --- |
| `suggest-agents` | `suggest` |

See `command-contracts.md` for global flags and exit codes.

### Flags

| Flag | Description |
| --- | --- |
| `--limit <n>` | Maximum suggestions to return (default `10`) |

Root `--json`, `--verbose`, and `-y` / `--yes` behave like `search`.

## Signal Collection

Tooling MUST collect signals from the project root (`cwd`):

1. **`package.json`** (when present and valid JSON):
   - Dependency keys from `dependencies`, `devDependencies`,
     `optionalDependencies`, and `peerDependencies`.
   - The `name` field when non-empty.
2. **README:** the first existing file among `README.md`, `readme.md`, and
   `Readme.md` at the project root. Body text MUST be tokenized into lowercase
   alphanumeric tokens of length at least `3`.
3. **Installed packages:** qualified ids from resolved `agents.json` `packages`
   keys (when config resolves). These ids MUST NOT appear in suggestions (see
   [Filtering](#filtering)).

Invalid `package.json` MUST NOT fail the command; tooling SHOULD emit a warning
and treat dependency/name signals as empty.

## Normalization

Before scoring, each signal MUST be:

- Trimmed and lowercased.
- For npm scoped names (`@scope/pkg`), expanded into separate tokens `scope` and
  `pkg` (without `@`).
- Deduplicated.

## Catalog Matching Fields

For each catalog package entry, matching targets include:

- Each `tags[]` value (normalized lowercase).
- `category` (normalized lowercase).
- Leaf `package` id.
- Index `aliases` keys whose value resolves to the package qualified `id`.

## Scoring

For each package, start score at `0`. For each normalized signal, apply the
following additive rules (multiple rules MAY apply for the same signal):

| Rule | Points | Condition |
| --- | --- | --- |
| Tag exact | +3 | Signal equals a tag (after normalization) |
| Tag or category substring | +2 | Signal length ≥ 3; substring of tag or `category` |
| Dependency leaf or alias | +1 | Dep/name signal equals leaf id or alias key |
| README token | +1 | README signal matches tag/category (exact or substring) |

When resolved `targets[]` is non-empty, tooling MUST add **+2** when the package
`installTargets` list includes at least one id present in `targets[]`.

## Filtering

- Packages with `status` `yanked` MUST NOT appear in suggestions.
- Packages whose qualified `id` is listed in resolved `agents.json` `packages`
  MUST NOT appear in suggestions.
- Only packages with **score &gt; 0** are candidates.
- Results MUST be sorted by score descending, then qualified `id` ascending
  (stable tie-break).
- Output MUST be truncated to `--limit` (default `10`).

Deprecated and archived packages MAY appear when score &gt; 0.

## Registry Resolution

`suggest-agents` MUST resolve registry settings like `search`: `ConfigResolver`
with `AGENTS_REPO_REGISTRY_URL` and default registry when config is absent. No
install target is required.

## JSON Output

With `--json`, stdout MUST be a single object:

| Field | Type | Description |
| --- | --- | --- |
| `indexUrl` | string | Catalog index URL |
| `updatedAt` | string | Catalog `updatedAt` |
| `warnings` | string[] | Config and registry warnings |
| `suggestions` | array | Ranked entries |

Each suggestion object MUST include at least: `id`, `name`, `description`,
`latest`, `status`, `owner`, `score`, `matchedSignals` (string array).

Config and registry warnings MUST NOT be duplicated on stderr when `--json` is set
(without interactive mode); behavior matches `search`.

## Exit Codes

Same as `search` (see `docs/commands/search.md`).

## Cross-References

- CLI: `command-contracts.md`, `config-schema.md`
- Registry: [index-schema.md](https://github.com/agents-repo/registry/blob/main/specs/index-schema.md)
