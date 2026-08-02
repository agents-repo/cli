import { describe, expect, it } from 'vitest'

import {
  assertSelectionInArtifactZip,
  listAgentAndFlowIdsFromZipEntryNames,
  parseItemIdFromZipEntry,
  zipEntryBelongsToSelection,
} from '../../../src/modules/install/application/installArtifactSelection.js'
import { ConfigValidationError } from '../../../src/modules/config/domain/configErrors.js'
import { buildDualCursorSkillZip, buildGithubCopilotZip } from '../../fixtures/installFixtures.js'

describe('installArtifactSelection', () => {
  it('lists cursor skill ids from zip entry names', () => {
    const ids = listAgentAndFlowIdsFromZipEntryNames(
      ['.cursor/skills/sample/SKILL.md', '.cursor/skills/planner/SKILL.md'],
      'cursor',
    )
    expect([...ids].sort((left, right) => left.localeCompare(right))).toEqual(['planner', 'sample'])
  })

  it('parses github-copilot agent ids', () => {
    expect(parseItemIdFromZipEntry('agents/planner.agent.md', 'github-copilot')).toBe('planner')
    expect(parseItemIdFromZipEntry('agents/planner.metadata.json', 'github-copilot')).toBe(
      'planner',
    )
  })

  it('matches zip entries for a selected cursor skill', () => {
    expect(
      zipEntryBelongsToSelection('.cursor/skills/sample/SKILL.md', 'cursor', 'sample'),
    ).toBe(true)
    expect(
      zipEntryBelongsToSelection('.cursor/skills/other/SKILL.md', 'cursor', 'sample'),
    ).toBe(false)
  })

  it('assertSelectionInArtifactZip accepts known selectors in dual-skill packages', () => {
    const zip = buildDualCursorSkillZip()
    expect(() =>
      assertSelectionInArtifactZip(zip, 'cursor', '1.0.0', 'agents-repo/sample-agent', {
        kind: 'single',
        id: 'planner',
      }),
    ).not.toThrow()
  })

  it('assertSelectionInArtifactZip rejects unknown selectors', () => {
    const zip = buildDualCursorSkillZip()
    expect(() =>
      assertSelectionInArtifactZip(zip, 'cursor', '1.0.0', 'agents-repo/sample-agent', {
        kind: 'single',
        id: 'missing',
      }),
    ).toThrow(ConfigValidationError)
  })

  it('assertSelectionInArtifactZip accepts known selectors', () => {
    const zip = buildGithubCopilotZip()
    expect(() =>
      assertSelectionInArtifactZip(zip, 'github-copilot', '1.0.0', 'agents-repo/sample-agent', {
        kind: 'single',
        id: 'sample',
      }),
    ).not.toThrow()
  })
})
