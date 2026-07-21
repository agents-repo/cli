# Install Target Detection Specification (1.0.0)

This document defines how the agents-repo CLI detects install targets from
project filesystem markers during `init`.

## Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be
interpreted as described in RFC 2119.

## Schema Version Lifecycle

| Version | Applies To | Status | Notes |
| --- | --- | --- | --- |
| `1.0.0` | spec document version | current | Initial release |

## Purpose

`agents.json` requires an install `target` id for install operations. During
`init`, tooling SHOULD suggest a default `target` when project markers indicate a
single IDE or agent consumer. Canonical install target ids and ZIP layouts are
defined in [registry install-targets](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md).

## Scope

- Detection applies during `init` only. `install` and `ConfigResolver` MUST NOT
  invoke detection implicitly.
- The caller supplies `projectRoot`. The detector MUST NOT resolve
  `agents.json` paths or `AGENTS_REPO_CONFIG`.
- Interactive prompts, `--target`, and config writes are out of scope for this
  spec; see `command-contracts.md` and `config-schema.md`.

## Project Root Validation

Before scanning markers, tooling MUST verify that `projectRoot` exists and is
readable. When `projectRoot` is missing or unreadable (`ENOENT`, `EACCES`),
tooling MUST throw `TargetDetectionError` with code `project_root_unavailable`.

Per-marker probe failures with `EACCES` MUST be treated as non-matching for that
marker only; detection MUST continue for other markers.

## Detection Table

A marker matches when the path exists relative to `projectRoot` and matches the
required entry kind (`file` or `directory`).

| Install target ID | Marker path | Kind | Policy |
| --- | --- | --- | --- |
| `github-copilot` | `.github/agents` | directory | Copilot-specific |
| `github-copilot` | `.github/copilot-instructions.md` | file | Copilot-specific |
| `cursor` | `.cursor` | directory | Top-level or layout |
| `cursor` | `.cursor/skills` | directory | Layout subpath |
| `cursor` | `.cursor/rules` | directory | Layout subpath |
| `claude-code` | `.claude` | directory | Top-level or layout |
| `claude-code` | `.claude/agents` | directory | Layout subpath |
| `openai-codex` | `.agents` | directory | Top-level or layout |
| `openai-codex` | `.agents/skills` | directory | Layout subpath |

### Non-matches

The following MUST NOT imply an install target match on their own:

- `.github/workflows/` or other `.github/` content without Copilot-specific paths
- A marker path that exists with the wrong kind (for example, a file at
  `.github/agents` when a directory is required)

Bare `.github/` MUST NOT imply `github-copilot`.

## Evaluation Rules

1. For each install target id, ANY matching marker in the table above counts as
   a detection for that target.
2. Collect all detected target ids. Order results by the canonical id order in
   [registry install-targets](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md).
3. For each detected target, record all matching marker paths (sorted).

## Result Contract

`ProjectTargetDetector.detect(projectRoot)` returns:

| Field | Type | Description |
| --- | --- | --- |
| `status` | `none` \| `single` \| `ambiguous` | Detection outcome |
| `detected` | `InstallTargetId[]` | Deduped detected ids in canonical order |
| `matches` | `{ target, markers[] }[]` | Per-target matched marker paths |
| `suggestedTarget` | `InstallTargetId` | Present only when `status` is `single` |

Status semantics:

| Status | Condition | `suggestedTarget` |
| --- | --- | --- |
| `none` | Zero targets detected | MUST be absent |
| `single` | Exactly one target detected | MUST equal the detected id |
| `ambiguous` | Two or more targets detected | MUST be absent |

Tooling MUST NOT treat an ambiguous or empty detection as a required install
target. `init` MUST prompt or require `--target` in those cases.

## Errors

| Code | When |
| --- | --- |
| `project_root_unavailable` | `projectRoot` missing or unreadable |

## Related Specs

- [install-targets.md](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md)
  — canonical target ids and ZIP layouts
- [config-schema.md](config-schema.md) — `target` field and merge semantics
- [cli-protocol.md](cli-protocol.md) — init-only detection reference
- [command-contracts.md](command-contracts.md) — `init --target`
