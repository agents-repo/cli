# npm publishing

This document describes how maintainers publish the **`agents-repo`** CLI to
[npm](https://www.npmjs.com/) from GitHub Actions using
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). End users
install with `npx agents-repo@latest`.

The npm package name is unscoped **`agents-repo`**. That is separate from the
**`@agents-repo`** key in `agents.json`, which is only the config namespace.

## Prerequisites

- Membership in the npm organization **`agents-repo`**
  ([org settings](https://www.npmjs.com/settings/agents-repo/packages))
- npm account security (2FA) per npm policy
- Admin access to the GitHub repository `agents-repo/cli`
- This repository merged to `main` with publish metadata and
  [`.github/workflows/release.yml`](../.github/workflows/release.yml) OIDC
  settings

## One-time npm setup

Complete trusted publishing **before** the first CI publish on `main`. The
**`agents-repo`** package is created on the registry when the first version is
published (npm orgs do not pre-create empty packages in the UI).

### 1. Account security

1. Sign in at [npmjs.com](https://www.npmjs.com/) as a member of the
   **`agents-repo`** org.
2. Enable **2FA** on your npm account (`auth-and-publish` or stricter if the org
   requires it).

### 2. Configure trusted publishing

Add a **Trusted Publisher** for the future package name **`agents-repo`** (npm
UI: package settings or org publishing settings, per current npm docs):

| Field | Value |
| --- | --- |
| Repository | `agents-repo/cli` |
| Workflow filename | `release.yml` |
| Branch | `main` |

Do not commit npm tokens to this repository. With trusted publishing, CI uses
OIDC (`id-token: write` on release jobs). npm **provenance** is generated
automatically on GitHub Actions when trusted publishing is configured (no
`publishConfig.provenance` needed in `package.json`).

For background, see:

- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers)
- [semantic-release GitHub Actions recipe](https://semantic-release.gitbook.io/semantic-release/recipes/ci-configurations/github-actions)

### 3. After the first successful publish

When CI publishes the first version, the package exists on npm. Then:

1. Open [org settings](https://www.npmjs.com/settings/agents-repo/packages).
2. **Teams** → select the team → **Add package** → choose **`agents-repo`**.
3. Grant the access level your org expects (read/publish).

### 4. Fallback (not recommended for routine releases)

If trusted publishing is unavailable, maintainers may use a short-lived
**granular access token** as `NPM_TOKEN` in the release workflow environment.
Rotate tokens when they expire. Prefer trusted publishing for routine releases.

## What CI does

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

| Trigger | Behavior |
| --- | --- |
| Push to `main` (after validate) | `semantic-release`: bump, npm publish, GitHub release |
| `workflow_dispatch`, dry_run **true**, on `main` | `npm run release:dry-run` after validation |
| `workflow_dispatch`, dry_run **false**, on `main` | Same as push to `main` |

Release jobs:

- Grant `id-token: write` so `@semantic-release/npm` can use OIDC trusted
  publishing (do **not** set `registry-url` on `actions/setup-node`; that
  writes an `.npmrc` that conflicts with semantic-release)
- Run `npm run build` (`dist/` is not committed; `prepack` also builds on pack)
- Set `HUSKY=0` so Husky does not run during publish
- Run semantic-release with `GITHUB_TOKEN` for GitHub plugin steps

Version bumps follow conventional commits (see
[CONTRIBUTING Release Workflow](../.github/CONTRIBUTING.md)).

## Version alignment (npm and GitHub)

GitHub Releases use tags `v1.7.0`, `v1.8.0`, and so on. npm must publish the
**same** semver on each release.

| Mechanism | Role |
| --- | --- |
| `semantic-release` on `main` | Single run: npm publish, GitHub Release, tag `vX.Y.Z` |
| [`package.json`](../package.json) `version` | Latest **released** semver (aligned with tags) |
| `@semantic-release/git` | Commits `package.json` + `package-lock.json` after release |

### One-time: npm `1.7.0` to match existing GitHub `v1.7.0`

GitHub already has **`v1.7.0`**. semantic-release will **not** republish that
tag. Before the next automated release, publish **`1.7.0`** to npm once so
`npx agents-repo@1.7.0` matches the latest GitHub release:

1. Merge npm publish config to `main` (including `version` `1.7.0` and trusted
   publisher setup).
2. On a clean tree at `main` with `version` `1.7.0`, run:

   ```bash
   npm run publish:local
   ```

   (`publish:local` sets `HUSKY=0`; `prepack` runs the build before publish.)

   (`npm pkg fix` keeps `bin` paths in the form `dist/...`, not `./dist/...`,
   so npm 12 does not strip the CLI entry during publish.)

3. Assign the package to the org team (section 3 above).
4. Confirm `npm view agents-repo version` is `1.7.0` and matches
   [GitHub Releases](https://github.com/agents-repo/cli/releases).

Later releases (`1.7.1`, `1.8.0`, …) are published only via the Release
workflow; npm and GitHub stay aligned automatically.

## Verification

### After npm trusted publisher is configured

1. On `main`, open **Actions → Release → Run workflow**, enable dry run.
2. Confirm logs mention `@semantic-release/npm` and `@semantic-release/github`.

### During development (before npm setup)

- `npm pack --dry-run` after `npm run build` — confirms `dist/`, `LICENSE`, and
  `README.md` in the tarball.
- Local `npm run release:dry-run` **requires** npm authentication once publish is
  enabled in `.releaserc.json` (use CI dry-run on `main` or a local
  `NPM_TOKEN`; never commit tokens).

### First production release

1. Merge the npm publish configuration to `main`.
2. Complete trusted publisher setup (sections 1–2 above).
3. Perform the **one-time npm `1.7.0` publish** (see
   [Version alignment](#version-alignment-npm-and-github)) if GitHub is at
   `v1.7.0`.
4. For the **next** version, land a **releasable** conventional commit on `main`
   (`feat:`, `fix:`, etc.); Release workflow publishes the same version to npm
   and GitHub.
5. Verify `npx agents-repo@latest --help` from a clean environment.

## Security

- Run `npm run check:secrets` before merge; do not add `.npmrc` with tokens to
  git.
- Review release workflow permissions: `id-token: write` only on release jobs.
