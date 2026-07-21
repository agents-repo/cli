import { describe, expect, it } from 'vitest'
import { isRegistryCatalog } from '../../../src/modules/registry/infrastructure/registryCatalogValidation.js'

const makeValidPackage = (): Record<string, unknown> => ({
  id: 'agents-repo/hello-agent',
  namespace: 'agents-repo',
  package: 'hello-agent',
  name: 'hello-agent',
  description: 'Hello Agent package',
  owner: 'agents-repo',
  latest: '1.0.0',
  tags: ['agent'],
  status: 'active',
  category: 'assistant',
  estimateOverallCost: {
    estimatedCost: 1,
    band: 'low',
  },
  installTargets: [
    { id: 'github-copilot', status: 'supported' },
    { id: 'cursor', status: 'experimental' },
  ],
})

describe('isRegistryCatalog', () => {
  it('accepts a catalog with installTargets and registry-aligned enums', () => {
    const payload = {
      schemaVersion: '1.3.0',
      updatedAt: '2026-06-08T02:09:56.645Z',
      packages: [makeValidPackage()],
    }

    expect(isRegistryCatalog(payload)).toBe(true)
  })

  it('rejects legacy inactive status', () => {
    const pkg = makeValidPackage()
    pkg.status = 'inactive'

    expect(
      isRegistryCatalog({
        schemaVersion: '1.3.0',
        updatedAt: '2026-06-08T02:09:56.645Z',
        packages: [pkg],
      }),
    ).toBe(false)
  })

  it('rejects invalid updatedAt values', () => {
    expect(
      isRegistryCatalog({
        schemaVersion: '1.3.0',
        updatedAt: 'not-a-date',
        packages: [makeValidPackage()],
      }),
    ).toBe(false)
  })
})
