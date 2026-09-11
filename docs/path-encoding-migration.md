# Qualified install path migration

Registry deployment ZIPs may use **qualified install-leaf** paths
(`pathEncoding: 1` in `manifest.json`) so two packages with the same source agent id do not collide
on disk. The CLI records this per package in `agents-lock.json` as `pathEncodingVersion: 1`
(`lockfileVersion: 3`).

## Mixed legacy and new packages

During the catalog republish train, a project may lock package A at legacy flat paths (no
`pathEncodingVersion`) beside package B at `pathEncodingVersion: 1`. This is expected. Install and
update each package independently; the CLI does not rewrite paths at install time.

## Updating a package

When `install` or `update` applies a republished artifact:

1. New files extract to qualified paths from the ZIP.
2. The lock entry gains `pathEncodingVersion: 1` when the manifest or ZIP shape indicates encoding
   `1`.
3. **Orphan legacy flat files** (same source id, old layout) may remain on disk. The CLI warns but
   does not delete them automatically; `remove` only deletes paths listed in the locked artifact.

## Dry-run and force

- `install --dry-run` / `update --dry-run` preview resolved versions and targets but do not extract;
  use `doctor` after a real install to verify paths.
- `install --force` / `update --force` keeps existing overwrite semantics for modified files at the
  same version.

## Doctor checks

- `legacy_path_encoding` — fails when a lock entry lacks `pathEncodingVersion` but the locked
  artifact still uses legacy flat skill or Claude agent paths. Re-install or update after registry
  artifacts are republished.
- `agent_path_collision` — fails when two locked packages would extract to the same relative path.
  Qualified install-leaf artifacts prevent this for packages that share a source agent id.

## Global scope

Global installs (`-g`) under `AGENTS_REPO_HOME` use the same encoding rules and lock schema as
project scope.
