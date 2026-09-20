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
