import { describe, expect, it } from 'vitest'

import {
  expectedLockArtifactName,
  mergeTargetLockSlot,
  parsePackageLockEntry,
} from '../../../src/modules/config/domain/packageLockEntry.js'
import { LockValidationError } from '../../../src/modules/config/domain/configErrors.js'

describe('packageLockEntry', () => {
  const slot = {
    integrity: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact: '1.0.0-cursor.zip',
  }

  const copilotSlot = {
    integrity: 'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact: '1.0.0-github-copilot.zip',
  }

  it('mergeTargetLockSlot merges slots at the same package version', () => {
    const first = mergeTargetLockSlot(undefined, 'cursor', '1.0.0', slot)
    const merged = mergeTargetLockSlot(first, 'github-copilot', '1.0.0', copilotSlot)

    expect(merged.version).toBe('1.0.0')
    expect(merged.byTarget.cursor).toEqual(slot)
    expect(merged.byTarget['github-copilot']).toEqual(copilotSlot)
  })

  it('mergeTargetLockSlot drops stale byTarget slots when package version changes', () => {
    const first = mergeTargetLockSlot(undefined, 'cursor', '1.0.0', slot)
    const withCopilot = mergeTargetLockSlot(first, 'github-copilot', '1.0.0', copilotSlot)

    const bumped = mergeTargetLockSlot(withCopilot, 'cursor', '1.1.0', {
      integrity: slot.integrity,
      artifact: '1.1.0-cursor.zip',
    })

    expect(bumped.version).toBe('1.1.0')
    expect(bumped.byTarget.cursor?.artifact).toBe('1.1.0-cursor.zip')
    expect(bumped.byTarget['github-copilot']).toBeUndefined()
  })

  it('parsePackageLockEntry rejects byTarget artifact names that do not match version', () => {
    expect(() =>
      parsePackageLockEntry(
        'agents-repo/hello-agent',
        {
          version: '1.0.0',
          byTarget: {
            cursor: {
              integrity: slot.integrity,
              artifact: '1.1.0-cursor.zip',
            },
          },
        },
        2,
      ),
    ).toThrow(LockValidationError)
  })

  it('expectedLockArtifactName follows registry naming', () => {
    expect(expectedLockArtifactName('2.0.0', 'github-copilot')).toBe(
      '2.0.0-github-copilot.zip',
    )
  })
})
