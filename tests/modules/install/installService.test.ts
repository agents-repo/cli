import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InstallRuntimeError } from '../../../src/modules/install/domain/installErrors.js'
import { InstallService } from '../../../src/modules/install/application/installService.js'
import { PackageYankedError } from '../../../src/modules/registry/domain/errors.js'
import * as registrySourceConfig from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'
import {
  buildCursorSkillZip,
  makeInstallTestCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  withInstallTestArtifactSha256,
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

const mockRegistryFetch = (
  manifest: ReturnType<typeof makeInstallTestManifest>,
  options: {
    readonly zipBytes?: Buffer
    readonly catalog?: ReturnType<typeof makeInstallTestCatalog>
  } = {},
) => {
  const catalog = options.catalog ?? makeInstallTestCatalog()

  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = toFetchUrl(input)

    if (url.includes('packages/index.json')) {
      return Promise.resolve(
        new Response(JSON.stringify(catalog), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

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

    if (options.zipBytes !== undefined && url.includes('1.0.0-cursor.zip')) {
      return Promise.resolve(new Response(options.zipBytes, { status: 200 }))
    }

    return Promise.resolve(new Response('not found', { status: 404 }))
  })
}

describe('InstallService', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('installs a package into a temp project with mocked registry HTTP', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-service-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        target: 'cursor',
        packages: {},
      }),
    )

    const zipBytes = buildCursorSkillZip()
    const sha256 = createHash('sha256').update(zipBytes).digest('hex')
    const manifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sha256)

    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.0.0',
      baseUrlRefResolution: { alias: 'v2.x', resolvedRef: 'v2.0.0' },
    })

    mockRegistryFetch(manifest, { zipBytes })

    const service = new InstallService()
    const result = await service.run({
      cwd,
      packageId: 'agents-repo/sample-agent',
    })

    expect(result.saved).toBe(true)
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain(
      'name: sample',
    )

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      packages: Record<string, string>
    }
    expect(config.packages['agents-repo/sample-agent']).toBe('^1.0.0')

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      resolvedRef: string
      packages: Record<string, { integrity: string }>
    }
    expect(lock.resolvedRef).toBe('v2.0.0')
    expect(lock.packages['agents-repo/sample-agent'].integrity).toBe(`sha256-${sha256}`)
  })

  it('stops before download on dry-run', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-dry-run-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        target: 'cursor',
        packages: {},
      }),
    )

    const fetchSpy = mockRegistryFetch(makeInstallTestManifest())

    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.0.0',
      baseUrlRefResolution: null,
    })

    const service = new InstallService()
    const result = await service.run({
      cwd,
      packageId: 'agents-repo/sample-agent',
      dryRun: true,
    })

    expect(result.dryRun).toBe(true)
    expect(result.artifactUrl).toContain('1.0.0-cursor.zip')
    expect(fetchSpy.mock.calls.some(([url]) => toFetchUrl(url).endsWith('.zip'))).toBe(false)
  })

  it('rejects yanked packages before download', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-yanked-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        target: 'cursor',
        packages: {},
      }),
    )

    mockRegistryFetch(makeInstallTestManifest(), {
      catalog: makeInstallTestCatalog({ status: 'yanked' }),
    })

    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.0.0',
      baseUrlRefResolution: null,
    })

    const service = new InstallService()

    await expect(
      service.run({
        cwd,
        packageId: 'agents-repo/sample-agent',
      }),
    ).rejects.toBeInstanceOf(PackageYankedError)
  })

  it('warns for deprecated packages', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-deprecated-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        target: 'cursor',
        packages: {},
      }),
    )

    const zipBytes = buildCursorSkillZip()
    const sha256 = createHash('sha256').update(zipBytes).digest('hex')
    const manifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sha256)

    mockRegistryFetch(manifest, {
      zipBytes,
      catalog: makeInstallTestCatalog({ status: 'deprecated' }),
    })

    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.0.0',
      baseUrlRefResolution: null,
    })

    const service = new InstallService()
    const result = await service.run({
      cwd,
      packageId: 'agents-repo/sample-agent',
      dryRun: true,
    })

    expect(result.warnings.some((warning) => warning.includes('deprecated'))).toBe(true)
  })

  it('extracts without updating config or lock when --no-save is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-no-save-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        target: 'cursor',
        packages: {},
      }),
    )

    const zipBytes = buildCursorSkillZip()
    const sha256 = createHash('sha256').update(zipBytes).digest('hex')
    const manifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sha256)

    mockRegistryFetch(manifest, { zipBytes })

    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.0.0',
      baseUrlRefResolution: null,
    })

    const service = new InstallService()
    const result = await service.run({
      cwd,
      packageId: 'agents-repo/sample-agent',
      noSave: true,
    })

    expect(result.saved).toBe(false)
    expect(result.noSave).toBe(true)
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain(
      'name: sample',
    )
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow()
    expect(
      JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as { packages: Record<string, string> },
    ).toEqual({
      schemaVersion: '1.0.0',
      registry: {
        url: 'https://registry-proxy.example.workers.dev',
        ref: 'v2.0.0',
      },
      target: 'cursor',
      packages: {},
    })
  })

  it('rejects checksum mismatches before extract', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-checksum-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        target: 'cursor',
        packages: {},
      }),
    )

    const zipBytes = buildCursorSkillZip()
    const manifest = withInstallTestArtifactSha256(makeInstallTestManifest(), 'f'.repeat(64))

    mockRegistryFetch(manifest, { zipBytes })

    vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
      sourceUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      configuredBaseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
      indexPath: 'packages/index.json',
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.0.0',
      baseUrlRefResolution: null,
    })

    const service = new InstallService()

    await expect(
      service.run({
        cwd,
        packageId: 'agents-repo/sample-agent',
      }),
    ).rejects.toBeInstanceOf(InstallRuntimeError)

    expect(() => readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toThrow()
  })
})
