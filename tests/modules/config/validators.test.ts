import { describe, expect, it } from 'vitest'

import { isExactSemver } from '../../../src/modules/config/domain/validators.js'

describe('validators.isExactSemver', () => {
  it('accepts strict MAJOR.MINOR.PATCH versions', () => {
    expect(isExactSemver('1.0.0')).toBe(true)
    expect(isExactSemver('0.0.0')).toBe(true)
    expect(isExactSemver('12.34.56')).toBe(true)
  })

  it('rejects prerelease, build metadata, and v-prefix forms', () => {
    expect(isExactSemver('1.0.0-beta.1')).toBe(false)
    expect(isExactSemver('1.0.0+build')).toBe(false)
    expect(isExactSemver('v1.0.0')).toBe(false)
  })
})
