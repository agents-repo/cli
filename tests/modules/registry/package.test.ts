import { describe, expect, it } from 'vitest'
import { resolvePackageRef } from '../../../src/modules/registry/domain/package.js'

describe('resolvePackageRef', () => {
  it('returns qualified ids unchanged', () => {
    expect(resolvePackageRef('agents-repo/hello-agent')).toBe('agents-repo/hello-agent')
  })

  it('resolves leaf ids through aliases', () => {
    expect(resolvePackageRef('sample-agent', { 'sample-agent': 'agents-repo/sample-agent' })).toBe(
      'agents-repo/sample-agent',
    )
  })

  it('returns trimmed leaf id when alias is missing', () => {
    expect(resolvePackageRef('  hello-agent  ')).toBe('hello-agent')
  })
})
