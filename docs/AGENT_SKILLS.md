# Agent skills inventory

Registry workflow packages install skills under `.agents/skills/` (Codex),
`.cursor/skills/` (Cursor), `.github/agents/` (Copilot), and `.claude/agents/`
(Claude). Do **not** hand-edit extracted files; update `agents.json` and run
`npm run agents:install` or `npm run agents:update`, then `npm run agents:ci`.

See [CONTRIBUTING.md — Registry workflow packages](../.github/CONTRIBUTING.md#registry-workflow-packages-cli)
for package management.

## Skill routing

| Skill | Purpose | Trigger |
| --- | --- | --- |
| `github-issue-intake` | Fetch issue context via `gh`; emit brief | Issue-driven task start |
| `issue-implementation-planner` | Draft ask-first implementation plan | After issue intake |
| `issue-implementation-planning` | Orchestrate intake, planning, refinement | Issue number or URL |
| `implementation-plan-refiner` | Refine plan against issue brief | After first plan draft |
| `plan-refinement` | Route plan to interactive or automatic refiner | Plan quality pass |
| `interactive-plan-refiner` | Ask-first plan refinement with repo check | User wants Q&A loop |
| `automatic-plan-refiner` | Assumption-first one-shot plan refinement | User wants no Q&A loop |
| `ai-readiness-analyst` | Report AI-first readiness of host project | Readiness audit |
| `improvement-planner` | Draft phased or full-shot improvement plan | After readiness + consent |
| `ai-first-project-planning` | Readiness then improvement planning | End-to-end planning flow |
| `ai-first-chat` | Readiness from URLs/uploads (no host tree) | External project analysis |
| `token-footprint-analyst` | Inventory context-token waste in host tree | Token audit |
| `token-reduction-advisor` | Plan-only token reduction from footprint | After footprint report |
| `reduce-context-tokens` | Orchestrate footprint + reduction planning | Token reduction planning |
| `context-token-chat` | Token footprint from URLs/uploads | External token analysis |
| `code-reviewer` | General-quality diff review | Pre-merge self-review |
| `bug-reviewer` | Bug-focused diff review | Logic or regression risk |
| `security-reviewer` | Security-focused diff review | Auth, secrets, untrusted input |
| `review-fix-ship` | Run reviews, fix, commit, push | Post-implementation ship |
| `findings-fixer` | Triage and fix merged review findings | After review comments |
| `github-pr-review-triage` | Triage PR review threads via `gh` | PR feedback loop |

Install paths vary by target: `.agents/skills/<skill-name>/SKILL.md` and
`.cursor/skills/<skill-name>/SKILL.md` (Codex and Cursor); Copilot uses
`.github/agents/<id>.agent.md`; Claude uses `.claude/agents/<id>.md`.

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
