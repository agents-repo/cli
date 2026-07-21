import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexSchemaError, ManifestSchemaError, RegistryCatalogValidationError, RegistryFetchError } from '../../../src/modules/registry/domain/errors.js'
import { loadPackageManifest, loadRegistryCatalog } from '../../../src/modules/registry/infrastructure/registryRepository.js'
import * as registrySourceConfig from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'

const makeTestCatalog = (schemaVersion = '1.3.0') => ({
  schemaVersion,
  updatedAt: '2026-06-08T02:09:56.645Z',
  packages: [
    {
      id: 'agents-repo/demo',
      namespace: 'agents-repo',
      package: 'demo',
      name: 'Demo',
      description: 'Demo package',
      owner: 'agents-repo',
      latest: '1.0.0',
      tags: [],
      status: 'active',
      category: 'assistant',
      estimateOverallCost: { band: 'low' },
    },
  ],
})

const makeTestManifest = (schemaVersion = '1.1.0') => ({
  schemaVersion,
  name: 'demo',
  latest: '1.0.0',
  versions: [
    {
      version: '1.0.0',
      artifacts: [
        {
          target: 'cursor',
          file: '1.0.0-cursor.zip',
          sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
})

describe('loadRegistryCatalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads catalog from network and returns ref resolution metadata', async () => {
    const indexUrl = 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0'

    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.maiconfz.workers.dev?ref=v2.x',
      configuredBaseUrl: 'https://registry-proxy.maiconfz.workers.dev?ref=v2.x',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      indexPath: 'packages/index.json',
      indexUrl,
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.x',
      baseUrlRefResolution: { alias: 'v2.x', resolvedRef: 'v2.0.0' },
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeTestCatalog()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await loadRegistryCatalog()

    expect(result.catalog.packages).toHaveLength(1)
    expect(result.baseUrlRefResolution).toEqual({ alias: 'v2.x', resolvedRef: 'v2.0.0' })
    expect(result.warnings).toEqual([])
  })

  it('returns deprecated index schema warnings from loadRegistryCatalog', async () => {
    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=main',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=main',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.x',
      baseUrlRefResolution: null,
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeTestCatalog('1.0.0')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await loadRegistryCatalog()

    expect(result.warnings[0]).toContain('deprecated')
  })

  it('throws RegistryCatalogValidationError for invalid catalog payloads', async () => {
    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=main',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=main',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.x',
      baseUrlRefResolution: null,
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ not: 'a catalog' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(loadRegistryCatalog()).rejects.toThrow(RegistryCatalogValidationError)
  })

  it('throws on unsupported index schema versions', async () => {
    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=main',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=main',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.x',
      baseUrlRefResolution: null,
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeTestCatalog('9.9.9')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(loadRegistryCatalog()).rejects.toThrow(IndexSchemaError)
  })

  it('throws RegistryFetchError on HTTP failures', async () => {
    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev?ref=main',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=main',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=main',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.x',
      baseUrlRefResolution: null,
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500, statusText: 'Error' }))

    await expect(loadRegistryCatalog()).rejects.toThrow(RegistryFetchError)
  })
})

describe('loadPackageManifest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads and validates manifest payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeTestManifest()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const manifest = await loadPackageManifest(
      'https://raw.githubusercontent.com/agents-repo/registry/main',
      'agents-repo',
      'demo',
    )

    expect(manifest.latest).toBe('1.0.0')
  })

  it('rejects eol manifest schema versions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeTestManifest('1.0.0')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      loadPackageManifest('https://raw.githubusercontent.com/agents-repo/registry/main', 'agents-repo', 'demo'),
    ).rejects.toThrow(ManifestSchemaError)
  })
})
