import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractPackageArtifact } from '../../../src/modules/install/infrastructure/packageExtractor.js'
import { mapZipEntryToExtractPath } from '../../../src/modules/install/infrastructure/targetExtractPaths.js'
import { buildCursorSkillZip, buildGithubCopilotZip } from '../../fixtures/installFixtures.js'

describe('targetExtractPaths', () => {
  it('remaps github-copilot agents paths under .github/agents', () => {
    expect(mapZipEntryToExtractPath('github-copilot', 'agents/sample.agent.md')).toBe(
      '.github/agents/sample.agent.md',
    )
  })

  it('keeps cursor paths unchanged', () => {
    expect(mapZipEntryToExtractPath('cursor', '.cursor/skills/sample/SKILL.md')).toBe(
      '.cursor/skills/sample/SKILL.md',
    )
  })
})

describe('packageExtractor', () => {
  it('extracts cursor skill layout into the project root', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-cursor-'))

    try {
      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd)
      const content = readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')
      expect(content).toContain('name: sample')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('extracts github-copilot artifacts under .github/agents', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-copilot-'))

    try {
      await extractPackageArtifact(buildGithubCopilotZip(), 'github-copilot', '1.0.0', cwd)
      const content = readFileSync(path.join(cwd, '.github/agents/sample.agent.md'), 'utf8')
      expect(content).toContain('name: sample')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
