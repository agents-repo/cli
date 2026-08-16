import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { planPackageInstall } from '../../../src/modules/install/application/installPackagePlan.js'
import type { ResolvedAgentsConfig } from '../../../src/modules/config/domain/agentsConfig.js'
import type { RegistryCatalogLoadResult } from '../../../src/modules/registry/infrastructure/registryRepository.js'
import {
  makeInstallTestCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
} from '../../fixtures/installFixtures.js'

const toFetchUrl = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

const makeResolvedConfig = (): ResolvedAgentsConfig => ({
  gateMode: 'top-level-ours',
  configPath: '/project/agents.json',
  lockPath: '/project/agents-lock.json',
  configRoot: '/project',
  schemaVersion: '1.0.0',
  registry: {
    url: 'https://registry-proxy.example.workers.dev',
    ref: 'v2.0.0',
  },
  targets: ['cursor'],
  packages: {
    'agents-repo/sample-agent': '^1.0.0',
  },
  warnings: [],
  rawDocument: null,
})

const makeCatalogResult = (): RegistryCatalogLoadResult => ({
  catalog: makeInstallTestCatalog(),
  indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
  registryBaseUrl: 'https://registry-proxy.example.workers.dev',
  baseUrlRefResolution: { alias: 'v2.x', resolvedRef: 'v2.0.0' },
  warnings: [],
})

describe('planPackageInstall', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('merges newer-than-CLI manifest schema warnings', async () => {
    const manifest = {
      ...makeInstallTestManifest(),
      schemaVersion: '1.3.0',
      extraOptional: true,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = toFetchUrl(input)

      if (url.includes('versions/manifest.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(manifest), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (url.includes('metadata.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(makeInstallTestMetadata()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      return Promise.resolve(new Response('not found', { status: 404 }))
    })

    const warnings: string[] = []
    await planPackageInstall({
      catalogResult: makeCatalogResult(),
      resolved: makeResolvedConfig(),
      packageId: 'agents-repo/sample-agent',
      target: 'cursor',
      warnings,
    })

    expect(warnings).toEqual([
      'Manifest schemaVersion "1.3.0" is newer than this CLI; consider upgrading agents-repo',
    ])
  })
})
