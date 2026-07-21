# AGENTS.md

## Cursor Cloud specific instructions

Standard commands and workflow live in `README.md` and
`.github/copilot-instructions.md` (mirrored to `.cursor/rules/agents-cli.mdc`).
Notes below are non-obvious environment caveats for this Cloud VM.

### Toolchain (shared across the agents-repo repos)

- Node and npm are provided through `nvm` + Corepack. The Cloud startup/update
  script installs Node `24.15.0` and `24.18.0` and activates Corepack
  `npm@12.0.1`, so you normally do not reinstall them.
- Gotcha: `/exec-daemon/node` (Node 22) sits ahead of `nvm` on `PATH`, so a bare
  `node` resolves to Node 22. Prepend this repo's pinned Node bin (`24.18.0`)
  before running scripts:

  ```bash
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
  export PATH="$HOME/.nvm/versions/node/v$(tr -d ' \n\r' < .nvmrc)/bin:$PATH"; hash -r
  ```

  After this, `node -v` = `v24.18.0` and `npm -v` = `12.0.1`.

### This repo

- Build then run the binary: `npm run build` produces `dist/`, then
  `node dist/bin/agents-repo.js --help` (or `--version`) runs the CLI.
- Subcommands (`init`, `install`, `search`, `list`) are intentional stubs that
  print "not implemented yet" — this repo is still contributor scaffolding, so
  `--help`/`--version` are the meaningful runnable surface today.
- Validate with `npm run env:check`, `npm run lint:all`, `npm run typecheck`,
  `npm test` (build + node:test + vitest), and `npm run check:secrets`.
