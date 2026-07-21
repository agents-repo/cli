# Architecture and DDD Decision

## Decision

Use a modular, DDD-inspired layout under `src/modules/` with feature-centric
boundaries. Each module keeps domain, application, infrastructure, and
presentation concerns separated when those layers are useful.

The CLI program uses **Commander 15** for argument parsing, subcommand
registration, and global option hooks.

## Planned Module Boundaries

- `src/modules/cli/` — Commander program setup, global flags, and command
  registration (implemented in issue #3). Commands delegate to other modules;
  no business logic here.
- `src/modules/config/` — `agents.json` and `agents-lock.json` read/write,
  schema gate, conflict detection, and merge semantics (implemented in issue
  #5).
- `src/modules/registry/` — Registry index, manifest, and artifact URL
  resolution; copy-adapted from the webapp registry module (implemented in
  issue #4).
- `src/modules/install/` — Planned download, SHA-256 verification, ZIP security
  scan, and extract packages per install target.
- `src/modules/target/` — Detection of IDE/project install targets from filesystem
  markers (implemented in issue #6; consumed by `init` in issue #7).

## CLI Framework Decision

**Chosen:** Commander 15 (`commander@^15`)

**Why:**

- Native ESM support matches this repository (`"type": "module"`, Node 24.18.0).
- Subcommand and alias API fits the MVP command surface (`install` / `i`,
  `search` / `find`, `list` / `ls`).
- `preAction` hooks and `optsWithGlobals()` support root-level `--json` and
  `--verbose` before subcommands run.

**Alternatives considered:**

- **yargs** — capable, but heavier API surface for a small CLI; less direct
  hook ergonomics for global options on subcommands.
- **citty** — minimal and modern, but smaller ecosystem and fewer examples for
  multi-level command trees.

## Registry Port Strategy

Registry client code **will be copy-adapted from the webapp** into
`src/modules/registry/`. There is no shared package in M0. Planned adaptations
include:

- Config-driven source URLs from `agents.json` and `AGENTS_REPO_REGISTRY_URL`
  instead of browser runtime overrides.
- Node-appropriate cache storage instead of browser `localStorage`.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the webapp-to-CLI file mapping.

## Rules

- Keep cross-module imports narrow and intentional.
- Put data access adapters in infrastructure, business rules in domain or
  application, and CLI wiring in `cli/presentation` only.
- Other modules MUST NOT add a `presentation/` layer; commands stay in `cli/`.
- Prefer local module composition over shared globals for feature-specific
  behavior.
- When a module grows, split by responsibility before duplicating logic
  elsewhere.

## Global Flags (M0)

Issue #3 registers root-level `--json` and `--verbose` with no-op hooks until
command output and logging land in later issues.

Deferred to command issues:

- `--yes` / `-y` — init and install conflict handling
- `--dry-run` — install resolve-only mode
- `--no-save` — skip config and lock writes

`DEBUG` env override for verbose logging is documented in
`specs/command-contracts.md` and will be wired when logging is implemented.

## Status

Module directories and the Commander root program are scaffolded in issue #3.
The registry module (issue #4) and config module (issue #5) are implemented.
Install target detection (issue #6) is implemented in `target/`. Install
pipeline and command wiring are tracked in downstream issues.

## Why This Decision Exists

The CLI has multiple cohesive capabilities (config, registry, install, target
detection) that benefit from explicit boundaries. This structure keeps the
codebase approachable for AI-assisted changes because each folder has a clear
responsibility and a predictable place for new code.

## Related Docs

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [development.md](../development.md)
