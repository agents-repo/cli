import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LockValidationError,
} from '../../../src/modules/config/domain/configErrors.js'
import { BulkInstallService } from '../../../src/modules/install/application/bulkInstallService.js'
import { CiInstallService } from '../../../src/modules/install/application/ciInstallService.js'
import * as registrySourceConfig from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'
import {
  buildCursorSkillZip,
  buildOtherCursorSkillZip,
  makeDualPackageInstallCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  makeInstallTestOtherManifest,
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

const mockDualPackageRegistryFetch = (
  sampleManifest: ReturnType<typeof makeInstallTestManifest>,
  otherManifest: ReturnType<typeof makeInstallTestOtherManifest>,
  options: {
    readonly sampleZipBytes: Buffer
    readonly otherZipBytes: Buffer
  },
) => {
  const catalog = makeDualPackageInstallCatalog()

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

    if (url.includes('/agents-repo/sample-agent/versions/manifest.json')) {
      return Promise.resolve(
        new Response(JSON.stringify(sampleManifest), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    if (url.includes('/agents-repo/other-agent/versions/manifest.json')) {
      return Promise.resolve(
        new Response(JSON.stringify(otherManifest), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    if (url.includes('/agents-repo/sample-agent/') && url.includes('metadata.json')) {
      return Promise.resolve(
        new Response(JSON.stringify(makeInstallTestMetadata()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    if (url.includes('/agents-repo/other-agent/') && url.includes('metadata.json')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ...makeInstallTestMetadata(),
            name: 'other-agent',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
    }

    if (url.includes('/agents-repo/sample-agent/') && url.includes('1.0.0-cursor.zip')) {
      return Promise.resolve(new Response(options.sampleZipBytes, { status: 200 }))
    }

    if (url.includes('/agents-repo/other-agent/') && url.includes('1.0.0-cursor.zip')) {
      return Promise.resolve(new Response(options.otherZipBytes, { status: 200 }))
    }

    return Promise.resolve(new Response('not found', { status: 404 }))
  })
}

const mockRegistrySource = (): void => {
  vi.spyOn(registrySourceConfig, 'resolveRegistryFetchSourceConfig').mockResolvedValue({
    sourceUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
    configuredBaseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
    baseUrl: 'https://registry-proxy.example.workers.dev/?ref=v2.0.0',
    indexPath: 'packages/index.json',
    indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
    configuredGithubRepositoryUrl: 'https://github.com/agents-repo/registry/tree/v2.0.0',
    baseUrlRefResolution: { alias: 'v2.x', resolvedRef: 'v2.0.0' },
  })
}

const writeDualPackageProject = (cwd: string): void => {
  writeFileSync(
    path.join(cwd, 'agents.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      registry: {
        url: 'https://registry-proxy.example.workers.dev',
        ref: 'v2.0.0',
      },
      targets: ['cursor'],
      packages: {
        'agents-repo/sample-agent': '^1.0.0',
        'agents-repo/other-agent': '^1.0.0',
      },
    }),
  )
}

describe('CiInstallService', () => {
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

  it('installs from lock without mutating config or lock files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-install-'))
    tempDirs.push(cwd)
    writeDualPackageProject(cwd)

    const sampleZipBytes = buildCursorSkillZip()
    const otherZipBytes = buildOtherCursorSkillZip()
    const sampleSha256 = createHash('sha256').update(sampleZipBytes).digest('hex')
    const otherSha256 = createHash('sha256').update(otherZipBytes).digest('hex')
    const sampleManifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sampleSha256)
    const otherManifest = withInstallTestArtifactSha256(makeInstallTestOtherManifest(), otherSha256)

    mockDualPackageRegistryFetch(sampleManifest, otherManifest, {
      sampleZipBytes,
      otherZipBytes,
    })
    mockRegistrySource()

    const bulk = new BulkInstallService()
    await bulk.runAll({ cwd })

    const configBefore = readFileSync(path.join(cwd, 'agents.json'), 'utf8')
    const lockBefore = readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')
    rmSync(path.join(cwd, '.cursor'), { recursive: true, force: true })

    const ci = new CiInstallService()
    const results = await ci.run({ cwd })

    expect(results).toHaveLength(2)
    expect(results.every((result) => result.saved === false && result.noSave === true)).toBe(true)
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain('name: sample')
    expect(readFileSync(path.join(cwd, 'agents.json'), 'utf8')).toBe(configBefore)
    expect(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toBe(lockBefore)
  })

  it('throws when agents-lock.json is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-no-lock-'))
    tempDirs.push(cwd)
    writeDualPackageProject(cwd)
    mockRegistrySource()

    const ci = new CiInstallService()
    await expect(ci.run({ cwd })).rejects.toBeInstanceOf(LockValidationError)
  })

  it('throws lock_config_package_drift when lock has extra package ids', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-drift-'))
    tempDirs.push(cwd)
    writeDualPackageProject(cwd)

    const sampleZipBytes = buildCursorSkillZip()
    const otherZipBytes = buildOtherCursorSkillZip()
    const sampleSha256 = createHash('sha256').update(sampleZipBytes).digest('hex')
    const otherSha256 = createHash('sha256').update(otherZipBytes).digest('hex')
    mockDualPackageRegistryFetch(
      withInstallTestArtifactSha256(makeInstallTestManifest(), sampleSha256),
      withInstallTestArtifactSha256(makeInstallTestOtherManifest(), otherSha256),
      { sampleZipBytes, otherZipBytes },
    )
    mockRegistrySource()

    await new BulkInstallService().runAll({ cwd })

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<string, unknown>
    }
    lock.packages['agents-repo/orphan'] = lock.packages['agents-repo/other-agent']
    writeFileSync(path.join(cwd, 'agents-lock.json'), JSON.stringify(lock))

    const ci = new CiInstallService()
    await expect(ci.run({ cwd })).rejects.toMatchObject({
      code: 'lock_config_package_drift',
    })
  })

  it('throws missing_by_target_slot when a required slot is absent', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-missing-slot-'))
    tempDirs.push(cwd)
    writeDualPackageProject(cwd)

    const sampleZipBytes = buildCursorSkillZip()
    const otherZipBytes = buildOtherCursorSkillZip()
    const sampleSha256 = createHash('sha256').update(sampleZipBytes).digest('hex')
    const otherSha256 = createHash('sha256').update(otherZipBytes).digest('hex')
    mockDualPackageRegistryFetch(
      withInstallTestArtifactSha256(makeInstallTestManifest(), sampleSha256),
      withInstallTestArtifactSha256(makeInstallTestOtherManifest(), otherSha256),
      { sampleZipBytes, otherZipBytes },
    )
    mockRegistrySource()

    await new BulkInstallService().runAll({ cwd })

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      targets: string[]
    }
    config.targets = ['cursor', 'github-copilot']
    writeFileSync(path.join(cwd, 'agents.json'), JSON.stringify(config))

    const ci = new CiInstallService()
    await expect(ci.run({ cwd })).rejects.toMatchObject({
      code: 'missing_by_target_slot',
    })
  })

  it('throws lock_version_range_mismatch unless force is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-range-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        targets: ['cursor'],
        packages: {
          'agents-repo/sample-agent': '^2.0.0',
        },
      }),
    )

    const sampleZipBytes = buildCursorSkillZip()
    const sampleSha256 = createHash('sha256').update(sampleZipBytes).digest('hex')
    writeFileSync(
      path.join(cwd, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/sample-agent': {
            version: '1.0.0',
            byTarget: {
              cursor: {
                artifact: '1.0.0-cursor.zip',
                integrity: `sha256-${sampleSha256}`,
              },
            },
          },
        },
      }),
    )

    mockDualPackageRegistryFetch(
      withInstallTestArtifactSha256(makeInstallTestManifest(), sampleSha256),
      withInstallTestArtifactSha256(makeInstallTestOtherManifest(), sampleSha256),
      { sampleZipBytes, otherZipBytes: sampleZipBytes },
    )
    mockRegistrySource()

    const ci = new CiInstallService()
    await expect(ci.run({ cwd })).rejects.toMatchObject({
      code: 'lock_version_range_mismatch',
    })

    rmSync(path.join(cwd, '.cursor'), { recursive: true, force: true })
    const results = await ci.run({ cwd, force: true })
    expect(results).toHaveLength(1)
    expect(results[0]?.version).toBe('1.0.0')
  })

  it('throws missing_target when targets are not configured', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-missing-target-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    )

    writeFileSync(
      path.join(cwd, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/sample-agent': {
            version: '1.0.0',
            byTarget: {
              cursor: {
                artifact: '1.0.0-cursor.zip',
                integrity: 'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              },
            },
          },
        },
      }),
    )

    mockRegistrySource()

    const ci = new CiInstallService()
    await expect(ci.run({ cwd })).rejects.toMatchObject({
      code: 'missing_target',
    })
  })
})
