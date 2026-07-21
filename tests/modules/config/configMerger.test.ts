import { describe, expect, it } from 'vitest'

import { ConfigMerger } from '../../../src/modules/config/application/configMerger.js'
import { DEFAULT_REGISTRY_CONFIG } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'

describe('ConfigMerger', () => {
  const merger = new ConfigMerger()

  it('writes greenfield top-level canonical document', () => {
    const document = merger.merge(null, { target: 'cursor' }, { gateMode: 'greenfield' })

    expect(document).toEqual({
      schemaVersion: '1.0.0',
      registry: DEFAULT_REGISTRY_CONFIG,
      packages: {},
      target: 'cursor',
    })
  })

  it('preserves foreign keys in top-level-ours merge', () => {
    const existing = {
      schemaVersion: '1.0.0',
      customTool: { enabled: true },
      packages: {},
      registry: DEFAULT_REGISTRY_CONFIG,
    }

    const document = merger.merge(existing, { target: 'cursor' }, { gateMode: 'top-level-ours' })

    expect(document.customTool).toEqual({ enabled: true })
    expect(document.target).toBe('cursor')
  })

  it('writes only @agents-repo subtree in namespace mode', () => {
    const existing = { customTool: { enabled: true } }
    const document = merger.merge(
      existing,
      { target: 'cursor', packages: { 'agents-repo/hello-agent': '^1.0.0' } },
      { gateMode: 'namespace' },
    )

    expect(document.customTool).toEqual({ enabled: true })
    expect(document.schemaVersion).toBeUndefined()
    expect(document['@agents-repo']).toMatchObject({
      target: 'cursor',
      packages: { 'agents-repo/hello-agent': '^1.0.0' },
    })
  })

  it('merges packages at key level without overwriting existing keys', () => {
    const existing = {
      schemaVersion: '1.0.0',
      packages: { 'agents-repo/pkg-a': '^1.0.0' },
      registry: DEFAULT_REGISTRY_CONFIG,
    }

    const document = merger.merge(
      existing,
      { packages: { 'agents-repo/pkg-b': '^2.0.0', 'agents-repo/pkg-a': '^9.0.0' } },
      { gateMode: 'top-level-ours' },
    )

    expect(document.packages).toEqual({
      'agents-repo/pkg-a': '^1.0.0',
      'agents-repo/pkg-b': '^2.0.0',
    })
  })

  it('force replaces package keys present in patch', () => {
    const existing = {
      schemaVersion: '1.0.0',
      packages: { 'agents-repo/pkg-a': '^1.0.0', 'agents-repo/pkg-b': '^2.0.0' },
      registry: DEFAULT_REGISTRY_CONFIG,
    }

    const document = merger.merge(
      existing,
      { packages: { 'agents-repo/pkg-a': '^9.0.0' } },
      { gateMode: 'top-level-ours', force: true },
    )

    expect(document.packages).toEqual({
      'agents-repo/pkg-a': '^9.0.0',
      'agents-repo/pkg-b': '^2.0.0',
    })
  })
})
