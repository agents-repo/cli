import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  assertInstallSurfacesExist,
  hasPackageInstallSurface,
  VerifyInstallSurfaceError,
} from '../../../src/modules/install/application/verifyInstallSurface.js'
import type { AgentsLockDocument } from '../../../src/modules/config/domain/agentsLock.js'

const writeCursorSkillSurface = (
  extractRoot: string,
  namespace: string,
  packageName: string,
  skillDirName: string,
): void => {
  const skillPath = path.join(
    extractRoot,
    '.cursor/skills',
    namespace,
    packageName,
    skillDirName,
    'SKILL.md',
  )
  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(skillPath, '# skill\n')
}

const writeGithubCopilotSurface = (
  extractRoot: string,
  namespace: string,
  packageName: string,
  leafName: string,
): void => {
  const agentPath = path.join(
    extractRoot,
    '.github/agents',
    `${namespace}--${packageName}--${leafName}.agent.md`,
  )
  mkdirSync(path.dirname(agentPath), { recursive: true })
  writeFileSync(agentPath, '# agent\n')
}

const writeLegacyGithubCopilotSurface = (
  extractRoot: string,
  namespace: string,
  relativePath: string,
): void => {
  const agentPath = path.join(extractRoot, '.github/agents', relativePath)
  mkdirSync(path.dirname(agentPath), { recursive: true })
  writeFileSync(agentPath, '# agent\n')
}

const writeClaudeAgentSurface = (
  extractRoot: string,
  namespace: string,
  packageName: string,
  leafName: string,
): void => {
  const agentPath = path.join(
    extractRoot,
    '.claude/agents',
    `${namespace}--${packageName}--${leafName}.md`,
  )
  mkdirSync(path.dirname(agentPath), { recursive: true })
  writeFileSync(agentPath, '# agent\n')
}

const writeLegacyClaudeAgentSurface = (
  extractRoot: string,
  namespace: string,
  relativePath: string,
): void => {
  const agentPath = path.join(extractRoot, '.claude/agents', relativePath)
  mkdirSync(path.dirname(agentPath), { recursive: true })
  writeFileSync(agentPath, '# agent\n')
}

const writeLegacyCursorSkillSurface = (
  extractRoot: string,
  namespace: string,
  packageName: string,
  skillRelativePath: string,
): void => {
  const skillPath = path.join(extractRoot, '.cursor/skills', namespace, skillRelativePath)
  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(skillPath, '# skill\n')
}

describe('hasPackageInstallSurface', () => {
  let extractRoot: string

  beforeEach(() => {
    extractRoot = mkdtempSync(path.join(os.tmpdir(), 'verify-install-surface-'))
    writeCursorSkillSurface(
      extractRoot,
      'maiconfz',
      'plan-refiner',
      'maiconfz--plan-refiner--plan-refinement',
    )
  })

  afterEach(() => {
    rmSync(extractRoot, { recursive: true, force: true })
  })

  it('detects installed cursor skills for a locked package', () => {
    expect(
      hasPackageInstallSurface({
        extractRoot,
        packageId: 'maiconfz/plan-refiner',
        target: 'cursor',
        pathEncodingVersion: 1,
      }),
    ).toBe(true)
  })

  it('returns false for missing packages', () => {
    expect(
      hasPackageInstallSurface({
        extractRoot,
        packageId: 'agents-repo/does-not-exist',
        target: 'cursor',
        pathEncodingVersion: 1,
      }),
    ).toBe(false)
  })

  it('detects installed github-copilot agents for a locked package', () => {
    writeGithubCopilotSurface(
      extractRoot,
      'maiconfz',
      'plan-refiner',
      'maiconfz--plan-refiner--plan-refinement',
    )

    expect(
      hasPackageInstallSurface({
        extractRoot,
        packageId: 'maiconfz/plan-refiner',
        target: 'github-copilot',
        pathEncodingVersion: 1,
      }),
    ).toBe(true)
  })

  it('detects installed claude-code agents for a locked package', () => {
    writeClaudeAgentSurface(
      extractRoot,
      'maiconfz',
      'plan-refiner',
      'maiconfz--plan-refiner--plan-refinement',
    )

    expect(
      hasPackageInstallSurface({
        extractRoot,
        packageId: 'maiconfz/plan-refiner',
        target: 'claude-code',
        pathEncodingVersion: 1,
      }),
    ).toBe(true)
  })

  it('does not match a sibling package in the same namespace (pathEncodingVersion 1)', () => {
    expect(
      hasPackageInstallSurface({
        extractRoot,
        packageId: 'maiconfz/other-package',
        target: 'cursor',
        pathEncodingVersion: 1,
      }),
    ).toBe(false)
  })

  it('detects legacy cursor skill layouts without pathEncodingVersion', () => {
    const legacyRoot = mkdtempSync(path.join(os.tmpdir(), 'verify-install-surface-legacy-cursor-'))
    try {
      writeLegacyCursorSkillSurface(
        legacyRoot,
        'maiconfz',
        'plan-refiner',
        'plan-refiner/legacy-skill/SKILL.md',
      )

      expect(
        hasPackageInstallSurface({
          extractRoot: legacyRoot,
          packageId: 'maiconfz/plan-refiner',
          target: 'cursor',
        }),
      ).toBe(true)
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true })
    }
  })

  it('detects legacy github-copilot layouts without pathEncodingVersion', () => {
    const legacyRoot = mkdtempSync(path.join(os.tmpdir(), 'verify-install-surface-legacy-copilot-'))
    try {
      writeLegacyGithubCopilotSurface(legacyRoot, 'maiconfz', 'maiconfz/plan-refiner/sample.agent.md')

      expect(
        hasPackageInstallSurface({
          extractRoot: legacyRoot,
          packageId: 'maiconfz/plan-refiner',
          target: 'github-copilot',
        }),
      ).toBe(true)
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true })
    }
  })

  it('detects legacy claude-code layouts without pathEncodingVersion', () => {
    const legacyRoot = mkdtempSync(path.join(os.tmpdir(), 'verify-install-surface-legacy-claude-'))
    try {
      mkdirSync(path.join(legacyRoot, '.claude/agents', 'maiconfz'), { recursive: true })
      writeLegacyClaudeAgentSurface(legacyRoot, 'maiconfz', 'maiconfz/plan-refiner/sample.md')

      expect(
        hasPackageInstallSurface({
          extractRoot: legacyRoot,
          packageId: 'maiconfz/plan-refiner',
          target: 'claude-code',
        }),
      ).toBe(true)
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true })
    }
  })
})

describe('assertInstallSurfacesExist', () => {
  let extractRoot: string

  beforeEach(() => {
    extractRoot = mkdtempSync(path.join(os.tmpdir(), 'verify-install-surface-'))
    writeCursorSkillSurface(
      extractRoot,
      'maiconfz',
      'plan-refiner',
      'maiconfz--plan-refiner--plan-refinement',
    )
  })

  afterEach(() => {
    rmSync(extractRoot, { recursive: true, force: true })
  })

  it('passes when lock targets match on-disk surfaces', () => {
    const lock: AgentsLockDocument = {
      lockfileVersion: 3,
      resolvedRef: 'v2.x',
      packages: {
        'maiconfz/plan-refiner': {
          version: '1.0.0',
          pathEncodingVersion: 1,
          byTarget: {
            cursor: {
              integrity: 'sha256-' + 'a'.repeat(64),
              artifact: '1.0.0-cursor.zip',
            },
          },
        },
      },
    }

    expect(() =>
      assertInstallSurfacesExist({
        extractRoot,
        packageIds: ['maiconfz/plan-refiner'],
        targets: ['cursor'],
        lock,
      }),
    ).not.toThrow()
  })

  it('throws VerifyInstallSurfaceError when surface is missing', () => {
    const lock: AgentsLockDocument = {
      lockfileVersion: 3,
      resolvedRef: 'v2.x',
      packages: {
        'agents-repo/missing-package': {
          version: '1.0.0',
          byTarget: {
            cursor: {
              integrity: 'sha256-' + 'b'.repeat(64),
              artifact: '1.0.0-cursor.zip',
            },
          },
        },
      },
    }

    expect(() =>
      assertInstallSurfacesExist({
        extractRoot,
        packageIds: ['agents-repo/missing-package'],
        targets: ['cursor'],
        lock,
      }),
    ).toThrow(VerifyInstallSurfaceError)
  })
})
