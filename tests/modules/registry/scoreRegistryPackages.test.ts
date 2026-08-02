import { describe, expect, it } from 'vitest'

import type { RegistryCatalog } from '../../../src/modules/registry/domain/package.js'
import { scoreRegistryPackages } from '../../../src/modules/registry/application/scoreRegistryPackages.js'

const catalog: RegistryCatalog = {
  schemaVersion: '1.3.0',
  updatedAt: '2026-01-01T00:00:00.000Z',
  aliases: {
    'sample-agent': 'agents-repo/sample-agent',
  },
  packages: [
    {
      id: 'agents-repo/sample-agent',
      namespace: 'agents-repo',
      package: 'sample-agent',
      name: 'sample-agent',
      description: 'Sample package',
      owner: 'agents-repo',
      latest: '1.0.0',
      tags: ['accessibility', 'sample'],
      status: 'active',
      category: 'testing',
      estimateOverallCost: { band: 'low' },
      installTargets: [{ id: 'cursor', status: 'supported' }],
    },
    {
      id: 'agents-repo/yanked',
      namespace: 'agents-repo',
      package: 'yanked',
      name: 'yanked',
      description: 'Yanked',
      owner: 'agents-repo',
      latest: '1.0.0',
      tags: ['accessibility'],
      status: 'yanked',
      category: 'testing',
      estimateOverallCost: { band: 'low' },
    },
    {
      id: 'agents-repo/other',
      namespace: 'agents-repo',
      package: 'other',
      name: 'other',
      description: 'Other',
      owner: 'agents-repo',
      latest: '1.0.0',
      tags: ['unrelated'],
      status: 'active',
      category: 'automation',
      estimateOverallCost: { band: 'low' },
    },
  ],
}

describe('scoreRegistryPackages', () => {
  it('ranks packages by score and omits yanked and installed ids', () => {
    const scored = scoreRegistryPackages({
      catalog,
      signals: [
        { value: 'accessibility', source: 'readme' },
        { value: 'sample-agent', source: 'dependency' },
      ],
      installedPackageIds: new Set(['agents-repo/other']),
      configuredTargets: ['cursor'],
    })

    expect(scored.map((entry) => entry.pkg.id)).toEqual(['agents-repo/sample-agent'])
    expect(scored[0]?.score).toBeGreaterThan(0)
    expect(scored.some((entry) => entry.pkg.id === 'agents-repo/yanked')).toBe(false)
    expect(scored.some((entry) => entry.pkg.id === 'agents-repo/other')).toBe(false)
  })

  it('breaks ties by package id ascending', () => {
    const tieCatalog: RegistryCatalog = {
      ...catalog,
      packages: [
        {
          ...catalog.packages[0],
          id: 'agents-repo/b-package',
          package: 'b-package',
          name: 'b-package',
        },
        {
          ...catalog.packages[0],
          id: 'agents-repo/a-package',
          package: 'a-package',
          name: 'a-package',
        },
      ],
    }

    const scored = scoreRegistryPackages({
      catalog: tieCatalog,
      signals: [{ value: 'accessibility', source: 'readme' }],
      installedPackageIds: new Set(),
    })

    expect(scored[0]?.pkg.id).toBe('agents-repo/a-package')
    expect(scored[1]?.pkg.id).toBe('agents-repo/b-package')
    expect(scored[0]?.score).toBe(scored[1]?.score)
  })
})
