# Pull Request

## Summary

Describe the change and why it is needed.

## Related Issues

`Closes #<issue-number>`

Replace this line with an unbackticked `Closes #<number>` so GitHub links the
issue.

For standard tasks, use `Closes #<issue-number>`. For security vulnerabilities
without a public tracking issue, reference the advisory identifier (for example
`GHSA-...`) and coordinate linkage with maintainers per the
[Workflow exceptions][org-wf-ex]
section of the organization CONTRIBUTING guide.

Every PR targeting `main` MUST include a tracking reference.

## Workflow Checklist

- [ ] A tracking issue was opened before implementation.
- [ ] The branch name follows `<prefix>/<issue-number>-<slug>`.
- [ ] This pull request was created as a draft (`gh pr create --draft` or UI
  draft option).
- [ ] This draft PR was opened before implementation commits (or it documents
  why not).
- [ ] `## Related Issues` includes a tracking reference (`Closes #<issue-number>`
  or a security-advisory identifier per the
  [Workflow exceptions][org-wf-ex]
  section of the organization CONTRIBUTING guide).
- [ ] Issue form was used or equivalent required fields were included.
- [ ] Merge to `main` is for human maintainers only; agents and automation
  must not merge this PR or push directly to `main`.
- [ ] A human developer marked this PR ready for review after validation (not
  agents or automation).

## Change Type

- [ ] Spec change
- [ ] Feature proposal
- [ ] Bug or inconsistency
- [ ] Task or chore

## Scope

List affected paths or areas:

- [ ] Root config files
- [ ] `src/` (including `src/bin/`)
- [ ] `specs/`
- [ ] `scripts/`
- [ ] `docs/`
- [ ] `.github/`

## Validation Checklist

- [ ] `npm run env:check`
- [ ] `npm run lint:all`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run check:secrets`
- [ ] Docs were updated where behavior or workflow changed.
- [ ] This PR follows the repository contributor guidance.

## Validation Evidence

- Commands run:
- Key outputs:

## Risk and Rollback

- Risk level: low / medium / high
- Rollback plan:

[org-wf-ex]: https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#workflow-exceptions
