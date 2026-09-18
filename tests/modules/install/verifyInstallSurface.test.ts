import { describe, expect, it } from 'vitest'

import {
  assertInstallSurfacesExist,
  hasPackageInstallSurface,
  VerifyInstallSurfaceError,
} from '../../../src/modules/install/application/verifyInstallSurface.js'
import type { AgentsLockDocument } from '../../../src/modules/config/domain/agentsLock.js'

const cliRepoRoot = process.cwd()

describe('hasPackageInstallSurface', () => {
  it('detects installed cursor skills for a locked package', () => {
    expect(
      hasPackageInstallSurface({
        extractRoot: cliRepoRoot,
        packageId: 'maiconfz/plan-refiner',
        target: 'cursor',
        pathEncodingVersion: 1,
      }),
    ).toBe(true)
  })

  it('returns false for missing packages', () => {
    expect(
      hasPackageInstallSurface({
        extractRoot: cliRepoRoot,
        packageId: 'agents-repo/does-not-exist',
        target: 'cursor',
        pathEncodingVersion: 1,
      }),
    ).toBe(false)
  })
})

describe('assertInstallSurfacesExist', () => {
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
        extractRoot: cliRepoRoot,
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
        extractRoot: cliRepoRoot,
        packageIds: ['agents-repo/missing-package'],
        targets: ['cursor'],
        lock,
      }),
    ).toThrow(VerifyInstallSurfaceError)
  })
})
