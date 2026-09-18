# `verify` command

Validate project `agents-lock.json` alignment with `agents.json` and check that
committed install surfaces exist on disk **without** downloading registry ZIP
artifacts.

Normative rules live in [`specs/command-contracts.md`](../../specs/command-contracts.md).

## Usage

```bash
agents-repo [global-options] verify
```

## Flags

| Flag | Description |
| --- | --- |
| `--online` | Also fetch the registry catalog index (`resolvedRef` from lock) |
| `--yes` / `-y` | Waive dual-definition config conflicts with warnings |

## Behavior

- Runs the same config/lock/`byTarget` checks as [`ci`](ci.md) prerequisites (no `--force`).
- Asserts each required `(package, target)` has an on-disk install surface under
  the target boundary (skills, agents, and so on).
- Does **not** download artifacts or verify lock `integrity` SHA-256. Use
  [`ci`](ci.md) locally for full artifact parity.

## JSON output

With `--json`, success stdout is:

```json
{
  "command": "verify",
  "warnings": []
}
```

## See also

- [`ci.md`](ci.md) — frozen install with artifact download (sends download-metrics opt-out header)
- [`doctor.md`](doctor.md) — `--skip-artifact-download` uses the same surface checks
