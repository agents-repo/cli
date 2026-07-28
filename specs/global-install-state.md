# Global install scope (superseded)

Global-scope installs (`-g` / `--global`) use the same **`agents.json`** and **`agents-lock.json`**
files as project scope, stored under the global home directory (default **`~/.agents-repo/`**).

See:

- [`config-schema.md`](config-schema.md) — global home paths and `AGENTS_REPO_HOME`
- [`lock-schema.md`](lock-schema.md) — lock v2 `byTarget` for all scopes
- [`cli-protocol.md`](cli-protocol.md) — install/update persistence rules

The former **`agents-global.json`** format is **not** supported (zero-user hard cut).
