import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRegistryFetchSourceConfig } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'

describe('resolveRegistryFetchSourceConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
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
})
