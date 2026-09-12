# Agent skills inventory

Registry workflow packages install skills under `.agents/skills/` (Codex),
`.cursor/skills/` (Cursor), `.github/agents/` (Copilot), and `.claude/agents/`
(Claude). Do **not** hand-edit extracted files; update `agents.json` and run
`npm run agents:install` or `npm run agents:update`, then `npm run agents:ci`.

See [CONTRIBUTING.md — Registry workflow packages](../.github/CONTRIBUTING.md#registry-workflow-packages-cli)
for package management.

## Skill routing

All packages below use namespace `maiconfz`. Skill IDs are fully qualified:
`maiconfz--{package-id}--{source-id}` (for example
`maiconfz--review-fix-ship--code-reviewer`).

### `maiconfz/github-interactive-issue-implementation-planner`

- `github-issue-intake` — fetch issue context via `gh`; emit brief
- `issue-implementation-planner` — draft ask-first implementation plan
- `issue-implementation-planning` — orchestrate intake, planning, refinement
- `implementation-plan-refiner` — refine plan against issue brief

### `maiconfz/plan-refiner`

- `plan-refinement` — route plan to interactive or automatic refiner
- `interactive-plan-refiner` — ask-first plan refinement with repo check
- `automatic-plan-refiner` — assumption-first one-shot plan refinement

### `maiconfz/ai-first-project-readiness`

- `ai-readiness-analyst` — report AI-first readiness of host project
- `improvement-planner` — draft phased or full-shot improvement plan
- `ai-first-project-planning` — readiness then improvement planning
- `ai-first-chat` — readiness from URLs/uploads (no host tree)

### `maiconfz/context-token-reduction`

- `token-footprint-analyst` — inventory context-token waste in host tree
- `token-reduction-advisor` — plan-only token reduction from footprint
- `reduce-context-tokens` — orchestrate footprint + reduction planning
- `context-token-chat` — token footprint from URLs/uploads

### `maiconfz/review-fix-ship`

- `code-reviewer` — general-quality diff review
- `bug-reviewer` — bug-focused diff review
- `security-reviewer` — security-focused diff review
- `review-fix-ship` — run reviews, fix, commit, push
- `findings-fixer` — triage and fix merged review findings

### `maiconfz/github-pr-review-triage`

- `github-pr-review-triage` — triage PR review threads via `gh`

Qualified install paths use `<namespace>/<package>/<install-leaf>` for Cursor,
Codex, and Claude targets:

- Cursor: `.cursor/skills/<namespace>/<package>/<install-leaf>/SKILL.md`
- Codex: `.agents/skills/<namespace>/<package>/<install-leaf>/SKILL.md`
- Copilot: `.github/agents/<install-leaf>.agent.md`
- Claude: `.claude/agents/<namespace>/<package>/<install-leaf>.md`

Legacy flat paths (for example `.cursor/skills/<skill-name>/SKILL.md`) remain
supported for older installs.

## Suggested flow

```text
issue → github-issue-intake → issue-implementation-planner → implement
     → code-reviewer / bug-reviewer / security-reviewer → findings-fixer
     → github-pr-review-triage → handoff
```

For AI-readiness documentation work:

```text
ai-readiness-analyst → improvement-planner (or ai-first-project-planning)
```
