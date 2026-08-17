---
marp: true
theme: agents-repo
paginate: true
---

<!-- markdownlint-disable-file MD025 -->

<!-- _class: title -->

# Using the agents-repo CLI

`npx agents-repo` — install packages into your project

---

# What it does

Official installer for the open registry.

It writes install-target files into **your** project (or global home with
`-g`), plus `agents.json` and `agents-lock.json`.

It does **not** author registry packages (that is the registry deck).

---

# Install targets

Marketing names (not IDs):

GitHub Copilot, Cursor, Claude Code, OpenAI Codex

Canonical IDs live in registry `specs/install-targets.md`. Use those IDs on
`--targets`.

---

# Quick start

```bash
npx agents-repo@latest --help
npx agents-repo@latest init --targets cursor
npx agents-repo@latest install
```

In a fresh project without install markers, pass `--targets` or `init` may
exit `3`. `--target` remains an alias for `--targets`.

---

# `init`

Creates or updates project config for one or more install targets.

```bash
npx agents-repo init --targets github-copilot claude-code openai-codex
```

See `docs/commands/init.md`.

---

# `install`

Fetches catalog + version manifest, verifies SHA-256, extracts ZIPs into
target paths.

After install, commit **`agents-lock.json`** (and **`agents.json`** when it
changes).

See `docs/commands/install.md`.

---

# `agents.json`

Project config: registry URL, selected packages, install targets.

Override the catalog with `AGENTS_REPO_REGISTRY_URL` or the URL in
`agents.json`. Default org setups use **registry-proxy** with a `v2.x` ref.

---

# `agents-lock.json`

Lockfile for reproducible installs (resolved versions and checksums).

Commit it. CI can run `npx agents-repo ci` to verify the lock matches
extracted files.

---

# Everyday commands

| Command | Use |
| --- | --- |
| `add-target` | Add another install target |
| `update` | Refresh within lock/semver policy |
| `remove` | Uninstall a package |
| `search` | Find packages in the catalog |
| `list` | Show installed / configured packages |

---

# More commands

| Command | Use |
| --- | --- |
| `suggest-agents` | Suggest packages for a prompt |
| `doctor` | Diagnose project/CLI problems |
| `ci` | Lockfile / extract drift check |
| `targets` | List install target ids |

Docs: `docs/commands/<name>.md`.

---

# Registry URL

Default production fetch goes through registry-proxy (cached, GET-only).

Point at GitHub or another base in development. See org `docs/ecosystem.md`
and the proxy architecture deck for how fetches are cached.

---

# Contributors

Changing CLI behavior: `docs/development.md`, `docs/ARCHITECTURE.md`,
`.github/CONTRIBUTING.md`.

Validation typically: `env:check`, `lint:all`, `test`, `typecheck`,
`check:secrets`.

This deck stays at **usage** level.

---

# Not this deck

- Package authoring → registry slides
- Worker path mapping → registry-proxy slides

---

# Links

- [https://agents-repo.org](https://agents-repo.org)
- Command docs under `docs/commands/`
- Org contributing workflow PDF in `.github`

---

<!-- _class: closing -->

# Next

`npx agents-repo@latest init --targets <id>` then `install`.
Run `doctor` if something looks wrong.
