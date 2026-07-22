# GitHub CLI Workflow

This document describes the **GitHub CLI (`gh`) contributor workflow** for this
repository. It is not documentation for the `agents-repo` product CLI commands.

See `.github/CONTRIBUTING.md` **Required Workflow** for normative rules.

User-facing `agents-repo` command documentation lives under `docs/commands/`.
See [commands/init.md](commands/init.md) for the `init` command.

## 0. Bootstrap Local Runtime

```bash
nvm use
corepack enable npm
corepack prepare npm@12.0.1 --activate
npm --version
npm run env:check
```

## 1. Create Issue

Use the matching issue form under `.github/ISSUE_TEMPLATE/` when available.

```bash
gh issue create --repo agents-repo/cli --title "feat: short description" --body-file <file>
```

## 2. Create Branch

```bash
git checkout main && git pull
git checkout -b "chore/<issue-number>-<slug>"
```

## 3. Push Branch and Open Draft Pull Request

```bash
git commit --allow-empty -m "chore: scaffold draft PR for #<issue-number>"
git push -u origin HEAD

gh pr create --repo agents-repo/cli --draft \
  --base main \
  --title "chore: short description" \
  --body-file .github/pull_request_template.md
```

Fill in `Closes #<issue-number>` in `## Related Issues`.

## 4. Implement and Validate

```bash
npm run env:check
npm run lint:all
npm run typecheck
npm run test
npm run check:secrets
```

## 5. Mark Ready and Merge (Human Maintainers Only)

After validation passes, the developer manually marks the pull request ready for
review. Agents MUST NOT mark pull requests ready for review or merge to `main`.
