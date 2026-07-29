# `remove` command

Uninstall a package that is configured in `agents.json` and recorded in
`agents-lock.json`: delete files extracted for each locked install target, then
remove the package from config and lock unless disabled.

## Usage

```bash
agents-repo remove <package-id> [options]
agents-repo rm <package-id> [options]
```

`<package-id>` is a qualified id (for example `agents-repo/sample-agent`) or an
index alias from `packages/index.json`. The package must appear in both
`agents.json` `packages` and `agents-lock.json`.

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--global` / `-g` | remove | Global scope: config, lock, and files under `~/.agents-repo/` |
| `--yes` / `-y` | remove / global | Waive dual-definition mismatches with warnings |
| `--force` | remove | Delete files even when modified since install |
| `--dry-run` | global | List paths that would be deleted; no delete or save |
| `--no-save` | global | Delete files but skip `agents.json` and lock updates |
| `--json` | global | Machine-readable success and error output |
| `--verbose` | global | Detailed logging |

## Behavior

### Locked artifacts

Remove uses the **lock** entry for the package (version and per-target
`artifact` / `integrity`). It does not pick a new version from semver ranges in
`agents.json`.

The CLI re-downloads each locked target ZIP to enumerate file paths (same mapping
as `install` extract). Registry uninstall layout rules are defined in
[install-targets.md](https://github.com/agents-repo/registry/blob/main/specs/install-targets.md).

### Safety

- Missing files: warning, continue (idempotent).
- Modified files: warning, skip unless `--force`.
- Non-file paths: warning, skip.

### Multi-target

When the lock entry has multiple `byTarget` slots, `remove` processes every slot
for that package.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `3` | Package not in `agents.json` or lock, or config validation error |

See [command-contracts.md](../../specs/command-contracts.md) for the full exit code table.

## See also

- [`install`](install.md) — add packages
- [`update`](update.md) — refresh versions within ranges
- [`list`](list.md) — show locked installs
