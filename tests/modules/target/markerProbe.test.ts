import fs from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import { createMarkerProbe } from '../../../src/modules/target/infrastructure/markerProbe.js'

describe('markerProbe', () => {
  it('returns false when stat fails with EACCES', async () => {
    const accessError = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    const statSpy = vi.spyOn(fs, 'stat').mockRejectedValue(accessError)

    try {
      const probe = createMarkerProbe()
      await expect(probe.isDirectory('/project/.cursor')).resolves.toBe(false)
      await expect(probe.isFile('/project/.github/copilot-instructions.md')).resolves.toBe(false)
    } finally {
      statSpy.mockRestore()
    }
  })
})
