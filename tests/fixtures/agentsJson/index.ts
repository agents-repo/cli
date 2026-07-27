export const canonicalTopLevelConfig = {
  schemaVersion: '1.0.0',
  registry: {
    url: 'https://registry-proxy.maiconfz.workers.dev',
    ref: 'v2.x',
  },
  targets: ['cursor'],
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
    targets: ['cursor'],
    packages: {
      'agents-repo/hello-agent': '^1.0.0',
    },
    registry: {
      url: 'https://registry-proxy.maiconfz.workers.dev',
      ref: 'v2.x',
    },
  },
} as const

export const partialNamespaceConfig = {
  customTool: {
    agents: ['planner'],
  },
  '@agents-repo': {
    targets: ['cursor'],
    packages: {},
  },
} as const

export const partialNamespaceNoTargetConfig = {
  customTool: {
    agents: ['planner'],
  },
  '@agents-repo': {
    packages: {},
  },
} as const

export const namespaceOnlyTargetConfig = {
  schemaVersion: '1.0.0',
  packages: {},
  registry: {
    url: 'https://registry-proxy.maiconfz.workers.dev',
    ref: 'v2.x',
  },
  '@agents-repo': {
    targets: ['claude-code'],
    packages: {},
  },
} as const

export const conflictingTopLevelConfig = {
  schemaVersion: '1.0.0',
  targets: ['cursor'],
  packages: {},
  registry: {
    url: 'https://registry-proxy.maiconfz.workers.dev',
    ref: 'v2.x',
  },
  '@agents-repo': {
    targets: ['claude-code'],
  },
} as const

export const legacyTargetOnlyConfig = {
  schemaVersion: '1.0.0',
  target: 'cursor',
  packages: {},
  registry: {
    url: 'https://registry-proxy.maiconfz.workers.dev',
    ref: 'v2.x',
  },
} as const
