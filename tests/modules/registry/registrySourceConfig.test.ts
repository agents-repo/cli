import { describe, expect, it } from 'vitest'
import {
  buildSourceUrlFromRegistryConfig,
  DEFAULT_REGISTRY_CONFIG,
  getRegistrySourceConfig,
} from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'

describe('registrySourceConfig', () => {
  it('builds source URL from registry config url and ref', () => {
    expect(buildSourceUrlFromRegistryConfig(DEFAULT_REGISTRY_CONFIG)).toBe(
      'https://registry-proxy.maiconfz.workers.dev/?ref=v2.x',
    )
  })

  it('returns configured source for default registry config', () => {
    const source = getRegistrySourceConfig()

    expect(source.configuredBaseUrl).toBe('https://registry-proxy.maiconfz.workers.dev/?ref=v2.x')
    expect(source.indexUrl).toBe('https://registry-proxy.maiconfz.workers.dev/packages/index.json?ref=v2.x')
    expect(source.configuredGithubRepositoryUrl).toBe('https://github.com/agents-repo/registry/tree/v2.x')
  })

  it('normalizes GitHub tree URLs from injected config', () => {
    const source = getRegistrySourceConfig({
      url: 'https://github.com/owner/repo/tree/main',
      ref: 'main',
    })

    expect(source.baseUrl).toBe('https://raw.githubusercontent.com/owner/repo/main')
    expect(source.indexUrl).toBe('https://raw.githubusercontent.com/owner/repo/main/packages/index.json')
  })

  it('replaces stale ref query parameters from registry config', () => {
    expect(
      buildSourceUrlFromRegistryConfig({
        url: 'https://registry-proxy.example.workers.dev?ref=v1.x',
        ref: 'v2.x',
      }),
    ).toBe('https://registry-proxy.example.workers.dev/?ref=v2.x')
  })

  it('embeds ref in GitHub tree URLs instead of using query parameters', () => {
    expect(
      buildSourceUrlFromRegistryConfig({
        url: 'https://github.com/agents-repo/registry',
        ref: 'v2.x',
      }),
    ).toBe('https://github.com/agents-repo/registry/tree/v2.x')
  })

  it('embeds ref in raw GitHub content URLs instead of using query parameters', () => {
    expect(
      buildSourceUrlFromRegistryConfig({
        url: 'https://raw.githubusercontent.com/agents-repo/registry/main',
        ref: 'v1.x',
      }),
    ).toBe('https://raw.githubusercontent.com/agents-repo/registry/v1.x')
  })
})
