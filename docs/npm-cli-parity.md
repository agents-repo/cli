# npm CLI parity reference

Single source of truth for how **agents-repo** subcommands relate to **npm**
command names, aliases, and shared flags. Normative behavior lives in
[`specs/command-contracts.md`](../specs/command-contracts.md); this document tracks
npm reference parity and intentional differences.

Tracking issue: [agents-repo/cli#38](https://github.com/agents-repo/cli/issues/38).

## Command matrix

| agents-repo command | npm analogue | Implemented aliases | npm ref aliases | Notes |
| --- | --- | --- | --- | --- |
| `init` | `npm init` (loose) | — | — | agents.json setup; `-g`; `--target` → `--targets` |
| `add-target` | — | — | — | agents-repo config helper |
| `install` | `npm install` | `i`, `add`, `inst` | `add`, `inst`, … | Variadic; bulk syncs `packages` ([#9](https://github.com/agents-repo/cli/issues/9)) |
| `ci` | `npm ci` | — | — | Project only; `-g` reserved ([#16](https://github.com/agents-repo/cli/issues/16)) |
| `doctor` | `npm doctor` (loose) | — | — | Read-only ([#17](https://github.com/agents-repo/cli/issues/17)); `-g` reserved |
| `update` | `npm update` | `up`, `upgrade` | `up`, `upgrade`, … | ([#13](https://github.com/agents-repo/cli/issues/13)) |
| `search` | `npm search` | `find`, `s`, `se` | `s`, `se`, … | `--interactive` is agents-repo only |
| `suggest-agents` | — | `suggest` | — | Registry scoring; no npm command |
| `list` | `npm list` | `ls` | `ls`, `la`, `ll`, … | `-g`; incomplete `byTarget` warnings |
| `remove` | `npm uninstall` / `npm rm` | `rm`, `uninstall`, `unlink` | `uninstall`, `unlink`, … | `unlink` UX alias ([#14](https://github.com/agents-repo/cli/issues/14)) |
| `targets` | — | — | — | Read-only ([#45](https://github.com/agents-repo/cli/issues/45)); `-g` |

## Global flags

| Flag | npm | agents-repo | Notes |
| --- | --- | --- | --- |
| `-h` / `--help` | yes | yes | All commands |
| `-V` / `--version` | yes | yes | Root program |
| `--json` | partial | yes | Per-command JSON shapes in spec |
| `--verbose` | yes | yes | Multi-target install summary when set |
| `-y` / `--yes` | yes | yes | Waive dual-definition conflicts with warnings |
| `--dry-run` | yes | yes | Install/update/remove resolve paths |
| `--no-save` | yes | yes | Skip config and lock writes |
| `--prefer-online` | — | yes | Bypass local artifact cache ([`artifact-cache.md`](../specs/artifact-cache.md)) |

### `-g` / `--global` by command

| Command | `-g` supported |
| --- | --- |
| `init`, `install`, `update`, `remove`, `list`, `targets` | yes |
| `ci`, `doctor` | reserved (follow-up) |
| `search`, `suggest-agents`, `add-target` | no |

## agents-repo–only surface

- Commands: `add-target`, `targets`, `suggest-agents`
- Flags: `--prefer-online`, `search --interactive`, `init --targets` / `--target`

## npm commands not mirrored (non-goals)

agents-repo is a registry catalog installer, not a package runtime. We do not
plan npm commands such as:

- `publish`, `pack`, `login`, `logout`, `whoami`
- `run`, `test`, `start`, `exec`
- `link`, `dedupe`, `audit`, `fund`, `explore`

Dropped selective-install designs are documented in
[`command-contracts.md`](../specs/command-contracts.md) (issues
[#19](https://github.com/agents-repo/cli/issues/19),
[#20](https://github.com/agents-repo/cli/issues/20)).

## Open parity gaps

- **Global `ci` and `doctor`** — spec reserves `-g`; not implemented yet.
- **Extra npm list aliases** (`la`, `ll`, …) — not implemented; only `ls`.
- **Extra npm install aliases** beyond `i`, `add`, `inst` — not implemented.

When adding a command or alias, update this file and the Command Aliases table in
[`specs/command-contracts.md`](../specs/command-contracts.md).
