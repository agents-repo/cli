export const canonicalTopLevelConfig = {
  schemaVersion: '1.0.0',
  registry: {
    url: 'https://registry-proxy.maiconfz.workers.dev',
    ref: 'v2.x',
  },
  target: 'cursor',
  packages: {
    'agents-repo/hello-agent': '^1.0.0',
  },
} as const

export const foreignOnlyConfig = {
  customTool: {
    agents: ['planner'],
  },
} as const

export const namespaceConfig = {
  customTool: {
    agents: ['planner'],
  },
  '@agents-repo': {
    target: 'cursor',
    packages: {
      'agents-repo/hello-agent': '^1.0.0',
    },
    registry: {
      url: 'https://registry-proxy.maiconfz.workers.dev',
      ref: 'v2.x',
    },
  },
} as const
