# Agent golden tasks

Representative scenarios for validating AI-first guidance in this repository.
Run validation commands after each scenario.

## 1. Fix a failing unit test in `config/`

**Goal:** Repair a broken assertion in a co-located `*.test.ts` under
`src/modules/config/`.

**Expected touches:** test file and possibly `src/modules/config/` source.

**Validation:**

```bash
npm run env:check && npm run lint:all && npm run typecheck && npm run test
```

## 2. Add a CLI flag per `command-contracts.md`

**Goal:** Add a documented flag to an existing subcommand with tests.

**Expected touches:** `src/modules/cli/presentation/`, `specs/command-contracts.md`
(if normative), co-located tests.

**Validation:**

```bash
npm run env:check && npm run lint:all && npm run typecheck && npm run test && npm run check:secrets
npm run sync:ide-instructions -- --check
```

## 3. Update org hub registry workflow package lock

**Goal:** Bump a package in the **`.github`** clone’s `agents.json`, run install,
verify extracted skills.

**Expected touches:** `agents-repo/.github` — `agents.json`, `agents-lock.json`,
extracted paths (via `agents-repo` install, not hand edit).

**Validation** (from `.github` clone):

```bash
cd ../.github && npm ci && npm run agents:verify && npm run agents:ci
```

From **cli** clone after `npm run build`:

```bash
npm run agents:verify:org
```

## 4. Spec change with dependency surfacing

**Goal:** Propose a change to `specs/lock-schema.md` using the spec-change issue
form and update dependent docs if needed.

**Expected touches:** `specs/`, `.github/ISSUE_TEMPLATE/spec-change.yml` fields,
possibly `docs/ARCHITECTURE.md`.

**Validation:**

```bash
npm run lint:all && npm run typecheck && npm run test
```

## 5. Copilot environment preflight parity

**Goal:** Confirm Copilot environment workflow runs the same core runtime checks
as this scenario (`env:check`, `lint:all`, `typecheck`, `test`). Full local
handoff may also include `check:secrets` and `sync:ide-instructions --check`;
those are not part of the Copilot environment workflow.

**Validation:**

```bash
npm run env:check && npm run lint:all && npm run typecheck && npm run test
```

CI: `.github/workflows/agent-environment.yml` runs this subset only.
