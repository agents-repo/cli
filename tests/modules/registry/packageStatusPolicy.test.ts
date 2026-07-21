import { describe, expect, it } from 'vitest'
import { PackageYankedError } from '../../../src/modules/registry/domain/errors.js'
import { evaluatePackageStatusPolicy } from '../../../src/modules/registry/application/packageStatusPolicy.js'

describe('evaluatePackageStatusPolicy', () => {
  it('allows active packages without warnings', () => {
    expect(evaluatePackageStatusPolicy('active', 'agents-repo/demo')).toEqual({ warnings: [] })
  })

  it('warns for deprecated and archived packages', () => {
    expect(evaluatePackageStatusPolicy('deprecated', 'agents-repo/demo').warnings[0]).toContain('deprecated')
    expect(evaluatePackageStatusPolicy('archived', 'agents-repo/demo').warnings[0]).toContain('archived')
  })

  it('rejects yanked packages', () => {
    expect(() => evaluatePackageStatusPolicy('yanked', 'agents-repo/demo')).toThrow(PackageYankedError)
  })
})
