import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRegistryFetchSourceConfig } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'
import { clearRegistryTagListCache } from '../../../src/modules/registry/infrastructure/registryTagResolver.js'

describe('resolveRegistryFetchSourceConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearRegistryTagListCache()
  })

  afterEach(() => {
    clearRegistryTagListCache()
    vi.restoreAllMocks()
  })

  it('resolves default v2.x configured source', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ name: 'v2.0.0' }, { name: 'v1.2.0' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const source = await resolveRegistryFetchSourceConfig()

    expect(source.baseUrlRefResolution).toEqual({ alias: 'v2.x', resolvedRef: 'v2.0.0' })
    expect(source.baseUrl).toBe('https://registry-proxy.maiconfz.workers.dev/?ref=v2.0.0')
    expect(source.indexUrl).toBe('https://registry-proxy.maiconfz.workers.dev/packages/index.json?ref=v2.0.0')
  })

  it('resolves major-version line refs before building fetch URLs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ name: 'v1.0.0' }, { name: 'v1.2.0' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const source = await resolveRegistryFetchSourceConfig({
      url: 'https://registry-proxy.example.workers.dev',
      ref: '1.x',
    })

    expect(source.baseUrlRefResolution).toEqual({ alias: '1.x', resolvedRef: 'v1.2.0' })
    expect(source.indexUrl).toBe('https://registry-proxy.example.workers.dev/packages/index.json?ref=v1.2.0')
  })

  it('resolves major-version line refs for GitHub tree URLs before building fetch URLs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ name: 'v2.0.0' }, { name: 'v2.1.0' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const source = await resolveRegistryFetchSourceConfig({
      url: 'https://github.com/agents-repo/registry/tree/v2.x',
      ref: 'v2.x',
    })

    expect(source.baseUrlRefResolution).toEqual({ alias: 'v2.x', resolvedRef: 'v2.1.0' })
    expect(source.baseUrl).toBe('https://raw.githubusercontent.com/agents-repo/registry/v2.1.0')
    expect(source.indexUrl).toBe(
      'https://raw.githubusercontent.com/agents-repo/registry/v2.1.0/packages/index.json',
    )
  })

  it('resolves major-version line refs for bare GitHub repository URLs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ name: 'v2.0.0' }, { name: 'v2.1.0' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const source = await resolveRegistryFetchSourceConfig({
      url: 'https://github.com/agents-repo/registry',
      ref: 'v2.x',
    })

    expect(source.baseUrlRefResolution).toEqual({ alias: 'v2.x', resolvedRef: 'v2.1.0' })
    expect(source.baseUrl).toBe('https://raw.githubusercontent.com/agents-repo/registry/v2.1.0')
    expect(source.indexUrl).toBe(
      'https://raw.githubusercontent.com/agents-repo/registry/v2.1.0/packages/index.json',
    )
  })
})
