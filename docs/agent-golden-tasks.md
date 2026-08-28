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

## 3. Update registry workflow package lock

**Goal:** Bump a package in `agents.json`, run install, verify extracted skills.

**Expected touches:** `agents.json`, `agents-lock.json`, extracted paths under
`.agents/skills/` (via install, not hand edit).

**Validation:**

```bash
npm run agents:ci
npm run sync:ide-instructions -- --check
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

**Goal:** Confirm Copilot environment workflow matches local handoff core checks.

**Validation:**

```bash
npm run env:check && npm run lint:all && npm run typecheck && npm run test
```

CI: `.github/workflows/copilot-environment.yml` should run the same subset.
