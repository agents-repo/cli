# `ci` command

Install exactly from `agents-lock.json` in CI (npm `ci` parity): no semver re-resolution from
`agents.json` ranges, strict validation of config vs lock, and fan-out across configured install
targets. Normative rules live in [`specs/lock-schema.md`](../../specs/lock-schema.md) and
[`specs/command-contracts.md`](../../specs/command-contracts.md).

## Usage

```bash
agents-repo [global-options] ci
```

Root flags such as `--json`, `--verbose`, and `--yes` / `-y` follow the same placement rules as
other commands (before the subcommand).

## Flags

| Flag | Scope | Description |
| --- | --- | --- |
| `--force` | ci | Allow lock version outside resolved `packages[<id>]` range |
| `--yes` / `-y` | global | Waive dual-definition config conflicts with warnings |
| `--json` | global | Machine-readable output |

`--force` does **not** waive missing `byTarget` slots or config/lock package-set drift.

## JSON output

With `--json`, success stdout is one JSON object:

```json
{
  "command": "ci",
  "warnings": [],
  "packages": []
}
```

Each `packages[]` entry matches bulk install fields (`packageId`, `version`, `target`, and so on).
Validation failures emit `{ "error": { "code", "message" } }` on stderr (for example
`lock_config_package_drift`, `missing_by_target_slot`, `lock_version_range_mismatch`).

## Behavior

### Prerequisites

- Project `agents.json` and `agents-lock.json` (or `AGENTS_REPO_CONFIG` for the manifest path).
- Non-empty resolved `targets[]` (same requirement as bulk [`install`](install.md) / [`update`](update.md)).
- `ci` does not run target detection; configure targets with [`init`](init.md) or [`add-target`](add-target.md).

### Package set

`ci` requires **exact alignment** between config and lock:

- Every `packages` key in `agents.json` must have a lock entry.
- Every lock `packages` key must appear in `agents.json` `packages`.

Orphan lock entries or missing lock entries fail with exit `3`. [`list`](list.md) still shows lock
entries even when config omits a range.

### Multi-target and `byTarget`

When `agents.json` lists multiple `targets`, `ci` installs each configured package once per target,
using only the matching lock slot (`byTarget[targetId].artifact` and `integrity`).

For every pair `(packageId, targetId)` where `packageId` is in `packages` and `targetId` is in
`targets`, the lock entry **must** include `byTarget[targetId]`. A missing slot fails with exit `3`
(fatal). [`list`](list.md) reports the same condition as a **warning** and still exits `0`.

`byTarget` keys for targets **not** in `agents.json` `targets` are ignored by `ci` (not installed).
They may remain in the lock from earlier partial installs; `list` may still display them.

### Contrast with `list`

| Concern | `list` | `ci` |
| --- | --- | --- |
| Missing `byTarget` for configured target | Warning, exit `0` | Exit `3` |
| Lock package not in `agents.json` `packages` | Still listed | Exit `3` |
| Semver resolution | N/A (read-only) | None (lock-only) |
| Writes config or lock | No | No |

### Resolution and extract

- Versions and artifacts come from the lock only (`resolvedRef` + per-slot `artifact` / `integrity`).
- Each required slot is downloaded, checksum-verified, ZIP-scanned, and extracted like
  [`install`](install.md), without updating `agents.json` or the lock.
- Artifact ZIP download retries transient `[registry_fetch_error]` (including HTTP 522) up to 3
  attempts with 2s then 4s backoff. Abort is not retried. Lock drift, checksum mismatch, ZIP
  security, and schema errors still fail immediately.
- Re-running `ci` when on-disk bytes match the lock artifact skips writes. When a managed file
  differs from the lock artifact, `ci` overwrites it (reproduce lock). This is independent of
  `--force`, which only waives `lock_version_range_mismatch` against `agents.json` ranges.

Run [`install`](install.md) or [`update`](update.md) locally after changing targets or packages so
every required `byTarget` slot exists before enabling `ci` in a pipeline.

## Example (GitHub Actions)

```yaml
- name: Install agents from lock
  run: npm run agents:ci
```

Consumer repositories pin the CLI in `devDependencies` and expose `agents:ci` in
`package.json`. Run `npm ci` before this step so `node_modules/.bin` is populated.

Commit `agents-lock.json` (and `agents.json` when it changes) so CI reproduces the same
`(package, target)` matrix as local bulk install.

## Related specs

- [lock-schema.md](../../specs/lock-schema.md) — frozen install and `byTarget` slot rules
- [command-contracts.md](../../specs/command-contracts.md) — `ci` flags and exit codes
- [cli-protocol.md](../../specs/cli-protocol.md) — pipeline steps for frozen install

## See also

- [`install`](install.md) — multi-target fan-out and lock updates
- [`list`](list.md) — incomplete `byTarget` warnings
- [Issue #16](https://github.com/agents-repo/cli/issues/16) — implementation tracking (shipped)
- [Issue #48](https://github.com/agents-repo/cli/issues/48) — this documentation
