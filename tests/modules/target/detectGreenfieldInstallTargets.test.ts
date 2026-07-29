import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { TargetDetectionResult } from '../../../src/modules/target/domain/targetDetection.js'
import {
  detectGreenfieldInstallTargets,
  formatAmbiguousTargetDetectionWarning,
} from '../../../src/modules/target/application/detectGreenfieldInstallTargets.js'
import type { ProjectTargetDetector } from '../../../src/modules/target/application/projectTargetDetector.js'

const stubDetector = (result: TargetDetectionResult): ProjectTargetDetector => {
  return {
    detect: vi.fn().mockResolvedValue(result),
  } as unknown as ProjectTargetDetector
}

describe('detectGreenfieldInstallTargets', () => {
  it('returns a warning when detection is ambiguous', async () => {
    const detection: TargetDetectionResult = {
      status: 'ambiguous',
      detected: ['cursor', 'claude-code'],
      matches: [],
    }

    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-detect-greenfield-'))
    const result = await detectGreenfieldInstallTargets(cwd, stubDetector(detection))

    expect(result.targets).toEqual(['claude-code', 'cursor'])
    expect(result.warnings).toEqual([
      formatAmbiguousTargetDetectionWarning(['claude-code', 'cursor']),
    ])
  })
})
