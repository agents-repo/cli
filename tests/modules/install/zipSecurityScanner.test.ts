import { afterEach, describe, expect, it, vi } from 'vitest'

import { scanTargetArtifactZipBuffer } from '../../../src/modules/install/infrastructure/zipSecurityScanner.js'
import {
  buildCursorSkillZip,
  buildGithubCopilotZip,
  buildTraversalZip,
} from '../../fixtures/installFixtures.js'

describe('zipSecurityScanner', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('accepts a valid cursor skill ZIP', () => {
    const issues = scanTargetArtifactZipBuffer(buildCursorSkillZip(), 'cursor', '1.0.0')
    expect(issues).toEqual([])
  })

  it('accepts a valid github-copilot deployment ZIP', () => {
    const issues = scanTargetArtifactZipBuffer(buildGithubCopilotZip(), 'github-copilot', '1.0.0')
    expect(issues).toEqual([])
  })

  it('rejects unsafe entries', () => {
    const issues = scanTargetArtifactZipBuffer(buildTraversalZip(), 'cursor', '1.0.0')
    expect(issues.length).toBeGreaterThan(0)
    expect(
      issues.some(
        (issue) => issue.code === 'ERR_ZIP_TRAVERSAL' || issue.code === 'ERR_ZIP_UNEXPECTED_ENTRY',
      ),
    ).toBe(true)
  })

  it('rejects symlink entries', async () => {
    vi.resetModules()
    vi.doMock('adm-zip', () => ({
      default: class MockAdmZip {
        getEntries() {
          return [
            {
              entryName: '.cursor/skills/sample/SKILL.md',
              attr: 0o120000 << 16,
              getData: () => Buffer.from('unused'),
            },
          ]
        }
      },
    }))

    const { scanTargetArtifactZipBuffer: scanWithMockedZip } = await import(
      '../../../src/modules/install/infrastructure/zipSecurityScanner.js'
    )

    const issues = scanWithMockedZip(Buffer.from('zip'), 'cursor', '1.0.0')
    expect(issues.some((issue) => issue.code === 'ERR_ZIP_SYMLINK')).toBe(true)

    vi.doUnmock('adm-zip')
    vi.resetModules()
  })
})
