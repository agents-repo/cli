import { describe, expect, it } from 'vitest'

import {
  normalizeSha256Hex,
  resolveContentBlobPath,
} from '../../../src/modules/install/infrastructure/artifactCachePaths.js'

describe('artifactCachePaths', () => {
  it('shards sha256 digests npm-style under content-v2', () => {
    const digest = 'a'.repeat(64)
    const blobPath = resolveContentBlobPath('/home/.agents-repo/cache', digest)

    expect(blobPath).toBe(
      `/home/.agents-repo/cache/content-v2/sha256/${'a'.repeat(2)}/${'a'.repeat(62)}`,
    )
  })

  it('normalizes uppercase hex', () => {
    const digest = `${'A'.repeat(64)}`
    expect(normalizeSha256Hex(digest)).toBe('a'.repeat(64))
  })
})
