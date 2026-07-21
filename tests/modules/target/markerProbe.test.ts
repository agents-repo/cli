import { beforeEach, describe, expect, it, vi } from 'vitest'

const statMock = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    stat: statMock,
  }
})

import { createMarkerProbe } from '../../../src/modules/target/infrastructure/markerProbe.js'

describe('markerProbe', () => {
  beforeEach(async () => {
    const { stat } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    statMock.mockImplementation(stat)
  })

  it('returns false when stat fails with EACCES', async () => {
    const accessError = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    statMock.mockRejectedValue(accessError)

    const probe = createMarkerProbe()
    await expect(probe.isDirectory('/project/.cursor')).resolves.toBe(false)
    await expect(probe.isFile('/project/.github/copilot-instructions.md')).resolves.toBe(false)
  })
})
