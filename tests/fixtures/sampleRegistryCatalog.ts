import type { RegistryCatalog } from '../../src/modules/registry/domain/package.js'

export const sampleRegistryCatalog: RegistryCatalog = {
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
      path: 'packages/agents-repo/sample-agent',
      name: 'sample-agent',
      description: 'A sample agent package for accessibility testing.',
      owner: 'agents-repo',
      latest: '1.0.0',
      tags: ['sample'],
      status: 'active',
      category: 'agent',
      estimateOverallCost: {
        band: 'low',
      },
      installTargets: [
        {
          id: 'cursor',
          status: 'supported',
        },
      ],
    },
  ],
}
