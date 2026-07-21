import { describe, expect, it } from 'vitest'

import { isExactSemver, isConcreteRegistryRef, isValidRfc3339Timestamp } from '../../../src/modules/config/domain/validators.js'

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

describe('validators.isValidRfc3339Timestamp', () => {
  it('accepts RFC 3339 timestamps with Z or offset', () => {
    expect(isValidRfc3339Timestamp('2026-07-21T06:45:00Z')).toBe(true)
    expect(isValidRfc3339Timestamp('2026-07-21T06:45:00.123Z')).toBe(true)
    expect(isValidRfc3339Timestamp('2026-07-21T06:45:00+01:00')).toBe(true)
  })

  it('rejects empty, malformed, and date-only values', () => {
    expect(isValidRfc3339Timestamp('')).toBe(false)
    expect(isValidRfc3339Timestamp('not-a-date')).toBe(false)
    expect(isValidRfc3339Timestamp('2026-07-21')).toBe(false)
  })
})

describe('validators.isConcreteRegistryRef', () => {
  it('accepts concrete registry refs', () => {
    expect(isConcreteRegistryRef('v2.3.1')).toBe(true)
    expect(isConcreteRegistryRef('main')).toBe(true)
  })

  it('rejects major-line aliases and surrounding whitespace', () => {
    expect(isConcreteRegistryRef('v2.x')).toBe(false)
    expect(isConcreteRegistryRef(' v2.3.1 ')).toBe(false)
    expect(isConcreteRegistryRef('')).toBe(false)
  })
})
