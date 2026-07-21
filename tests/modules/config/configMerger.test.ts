import { describe, expect, it } from 'vitest'

import { ConfigMerger } from '../../../src/modules/config/application/configMerger.js'
import { ConfigValidationError } from '../../../src/modules/config/domain/configErrors.js'
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
      schemaVersion: '1.0.0',
      target: 'cursor',
      packages: { 'agents-repo/hello-agent': '^1.0.0' },
      registry: DEFAULT_REGISTRY_CONFIG,
    })
  })

  it('defaults required write fields for namespace target-only patch', () => {
    const existing = { customTool: { enabled: true } }
    const document = merger.merge(existing, { target: 'cursor' }, { gateMode: 'namespace' })

    expect(document['@agents-repo']).toEqual({
      schemaVersion: '1.0.0',
      target: 'cursor',
      registry: DEFAULT_REGISTRY_CONFIG,
      packages: {},
    })
  })

  it('migrates legacy registryUrl to canonical registry.url on top-level write', () => {
    const existing = {
      schemaVersion: '1.0.0',
      registryUrl: 'https://legacy.example',
      packages: {},
    }

    const document = merger.merge(existing, { target: 'cursor' }, { gateMode: 'top-level-ours' })

    expect(document.registry).toEqual({
      url: 'https://legacy.example',
      ref: 'v2.x',
    })
    expect(document.registryUrl).toBeUndefined()
    expect(document.target).toBe('cursor')
  })

  it('preserves explicit registry.ref when migrating registryUrl in namespace mode', () => {
    const existing = {
      customTool: { enabled: true },
      '@agents-repo': {
        registryUrl: 'https://legacy.example',
        registry: { ref: 'v3.x' },
        packages: {},
      },
    }

    const document = merger.merge(existing, { target: 'cursor' }, { gateMode: 'namespace' })

    const namespaceBlock = document['@agents-repo']
    expect(namespaceBlock).toMatchObject({
      schemaVersion: '1.0.0',
      target: 'cursor',
      registry: {
        url: 'https://legacy.example',
        ref: 'v3.x',
      },
      packages: {},
    })
    expect(namespaceBlock).not.toHaveProperty('registryUrl')
  })

  it('rejects greenfield merge when existing document is not empty', () => {
    expect(() =>
      merger.merge({ customTool: { enabled: true } }, { target: 'cursor' }, { gateMode: 'greenfield' }),
    ).toThrow(ConfigValidationError)
  })

  it('writes greenfield top-level output when existing is null regardless of gateMode', () => {
    const document = merger.merge(null, { target: 'cursor' }, { gateMode: 'namespace' })

    expect(document).toEqual({
      schemaVersion: '1.0.0',
      registry: DEFAULT_REGISTRY_CONFIG,
      packages: {},
      target: 'cursor',
    })
  })

  it('does not overwrite existing target without force', () => {
    const existing = {
      schemaVersion: '1.0.0',
      target: 'cursor',
      packages: {},
      registry: DEFAULT_REGISTRY_CONFIG,
    }

    const document = merger.merge(existing, { target: 'claude-code' }, { gateMode: 'top-level-ours' })

    expect(document.target).toBe('cursor')
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
