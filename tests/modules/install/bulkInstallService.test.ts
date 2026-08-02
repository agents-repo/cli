import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BulkInstallService } from '../../../src/modules/install/application/bulkInstallService.js'
import * as registrySourceConfig from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'
import {
  buildCursorSkillZip,
  buildGithubCopilotZip,
  buildOtherCursorSkillZip,
  makeDualPackageInstallCatalog,
  makeInstallTestCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  makeInstallTestOtherManifest,
  makeMultiTargetInstallTestManifest,
  makeMultiTargetInstallTestMetadata,
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

describe('BulkInstallService', () => {
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

  it('installs all configured packages and writes a combined lock file', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-'))
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
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    )

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

    const service = new BulkInstallService()
    const results = await service.runAll({ cwd })

    expect(results).toHaveLength(2)
    expect(results.map((result) => result.packageId).sort((left, right) => left.localeCompare(right))).toEqual([
      'agents-repo/other-agent',
      'agents-repo/sample-agent',
    ])
    expect(results.every((result) => result.saved)).toBe(true)

    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain('name: sample')
    expect(readFileSync(path.join(cwd, '.cursor/skills/other/SKILL.md'), 'utf8')).toContain('name: other')

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      resolvedRef: string
      lockfileVersion: number
      packages: Record<string, { version: string; byTarget: Record<string, { integrity: string }> }>
    }
    expect(lock.resolvedRef).toBe('v2.0.0')
    expect(lock.lockfileVersion).toBe(2)
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.0.0')
    expect(lock.packages['agents-repo/other-agent'].version).toBe('1.0.0')
    expect(lock.packages['agents-repo/sample-agent'].byTarget.cursor.integrity).toBe(
      `sha256-${sampleSha256}`,
    )
    expect(lock.packages['agents-repo/other-agent'].byTarget.cursor.integrity).toBe(
      `sha256-${otherSha256}`,
    )
  })

  it('writes a stable lock file when reinstalling after clearing extracted files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-idempotent-'))
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
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    )

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

    const service = new BulkInstallService()
    await service.runAll({ cwd })
    const lockAfterFirst = readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')

    rmSync(path.join(cwd, '.cursor'), { recursive: true, force: true })

    await service.runAll({ cwd })
    const lockAfterSecond = readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')

    expect(lockAfterSecond).toBe(lockAfterFirst)
  })

  it('returns no results when packages map is empty', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-empty-'))
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
        packages: {},
      }),
    )

    mockRegistrySource()

    const service = new BulkInstallService()
    const results = await service.runAll({ cwd })

    expect(results).toEqual([])
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow()
  })

  it('installs multiple ad-hoc package ids and persists all packages ranges', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-multi-adhoc-'))
    tempDirs.push(cwd)

    const configPath = path.join(cwd, 'agents.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        targets: ['cursor'],
        packages: {},
      }),
    )

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

    const service = new BulkInstallService()
    const results = await service.runAll({
      cwd,
      packageIds: ['agents-repo/sample-agent', 'agents-repo/other-agent'],
    })

    expect(results).toHaveLength(2)
    expect(results.every((result) => result.saved)).toBe(true)

    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      packages: Record<string, string>
    }
    expect(config.packages['agents-repo/sample-agent']).toBe('^1.0.0')
    expect(config.packages['agents-repo/other-agent']).toBe('^1.0.0')

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<string, { version: string }>
    }
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.0.0')
    expect(lock.packages['agents-repo/other-agent'].version).toBe('1.0.0')
  })

  it('dedupes duplicate package refs without warnings (npm install parity)', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-dedupe-refs-'))
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
        packages: {},
      }),
    )

    const sampleZipBytes = buildCursorSkillZip()
    const sampleSha256 = createHash('sha256').update(sampleZipBytes).digest('hex')
    const sampleManifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sampleSha256)
    const otherManifest = withInstallTestArtifactSha256(makeInstallTestOtherManifest(), 'a'.repeat(64))

    const fetchSpy = mockDualPackageRegistryFetch(sampleManifest, otherManifest, {
      sampleZipBytes,
      otherZipBytes: buildOtherCursorSkillZip(),
    })
    mockRegistrySource()

    const service = new BulkInstallService()
    const results = await service.runAll({
      cwd,
      packageIds: [
        'agents-repo/sample-agent',
        'sample-agent',
        'agents-repo/sample-agent',
      ],
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.packageId).toBe('agents-repo/sample-agent')
    expect(results[0]?.warnings).toEqual([])
    expect(fetchSpy.mock.calls.filter(([url]) => toFetchUrl(url).includes('.zip'))).toHaveLength(1)

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      packages: Record<string, string>
    }
    expect(Object.keys(config.packages)).toEqual(['agents-repo/sample-agent'])
  })

  it('installs configured and ad-hoc package ids in one variadic invocation', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-mixed-refs-'))
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
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    )

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

    const service = new BulkInstallService()
    const results = await service.runAll({
      cwd,
      packageIds: ['agents-repo/sample-agent', 'agents-repo/other-agent'],
    })

    expect(results).toHaveLength(2)
    expect(
      results
        .map((result) => result.packageId)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(['agents-repo/other-agent', 'agents-repo/sample-agent'])

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      packages: Record<string, string>
    }
    expect(config.packages['agents-repo/sample-agent']).toBe('^1.0.0')
    expect(config.packages['agents-repo/other-agent']).toBe('^1.0.0')
  })

  it('dry-run resolves all packages without writing lock files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-dry-run-'))
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
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    )

    const sampleZipBytes = buildCursorSkillZip()
    const otherZipBytes = buildOtherCursorSkillZip()
    const sampleSha256 = createHash('sha256').update(sampleZipBytes).digest('hex')
    const otherSha256 = createHash('sha256').update(otherZipBytes).digest('hex')
    const sampleManifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sampleSha256)
    const otherManifest = withInstallTestArtifactSha256(makeInstallTestOtherManifest(), otherSha256)

    const fetchSpy = mockDualPackageRegistryFetch(sampleManifest, otherManifest, {
      sampleZipBytes,
      otherZipBytes,
    })
    mockRegistrySource()

    const service = new BulkInstallService()
    const results = await service.runAll({ cwd, dryRun: true })

    expect(results).toHaveLength(2)
    expect(results.every((result) => result.dryRun)).toBe(true)
    expect(fetchSpy.mock.calls.some(([url]) => toFetchUrl(url).includes('.zip'))).toBe(false)
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow()
  })

  it('does not write project config or lock on global bulk install', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-global-home-'))
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-global-'))
    tempDirs.push(cwd)
    tempDirs.push(homeDir)

    const configPath = path.join(cwd, 'agents.json')
    const configBefore = {
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
    }
    writeFileSync(configPath, JSON.stringify(configBefore))

    const globalRoot = path.join(homeDir, '.agents-repo')
    mkdirSync(globalRoot, { recursive: true })
    writeFileSync(path.join(globalRoot, 'agents.json'), JSON.stringify(configBefore))

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

    const service = new BulkInstallService()
    const results = await service.runAll({
      cwd,
      global: true,
      env: { ...process.env, HOME: homeDir },
    })

    expect(results).toHaveLength(2)
    expect(results.every((result) => result.saved === true && result.global === true)).toBe(true)
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow()
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(configBefore)
  })

  it('rolls back earlier extracts when a later package fails in the loop', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-rollback-'))
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
          'agents-repo/other-agent': '^1.0.0',
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    )

    const sampleZipBytes = buildCursorSkillZip()
    const otherZipBytes = buildOtherCursorSkillZip()
    const otherSha256 = createHash('sha256').update(otherZipBytes).digest('hex')
    const otherManifest = withInstallTestArtifactSha256(makeInstallTestOtherManifest(), otherSha256)
    const sampleManifest = withInstallTestArtifactSha256(makeInstallTestManifest(), 'f'.repeat(64))

    mockDualPackageRegistryFetch(sampleManifest, otherManifest, {
      sampleZipBytes,
      otherZipBytes,
    })
    mockRegistrySource()

    const service = new BulkInstallService()

    await expect(service.runAll({ cwd })).rejects.toThrow()

    expect(() => readFileSync(path.join(cwd, '.cursor/skills/other/SKILL.md'), 'utf8')).toThrow()
    expect(() => readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toThrow()
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow()
  })

  it('rejects update for a package id that is not configured when enforceConfiguredOnly is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-not-configured-'))
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
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    )

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

    const service = new BulkInstallService()

    await expect(
      service.runAll({
        cwd,
        packageId: 'agents-repo/other-agent',
        enforceConfiguredOnly: true,
      }),
    ).rejects.toThrow(/not listed in agents\.json packages/)
  })

  it('installs configured package for each target and writes byTarget lock slots', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-bulk-install-multitarget-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: {
          url: 'https://registry-proxy.example.workers.dev',
          ref: 'v2.0.0',
        },
        targets: ['cursor', 'github-copilot'],
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    )

    const cursorZipBytes = buildCursorSkillZip()
    const copilotZipBytes = buildGithubCopilotZip()
    const cursorSha256 = createHash('sha256').update(cursorZipBytes).digest('hex')
    const copilotSha256 = createHash('sha256').update(copilotZipBytes).digest('hex')

    const baseManifest = makeMultiTargetInstallTestManifest()
    const manifest = {
      ...baseManifest,
      versions: [
        {
          ...baseManifest.versions[0],
          artifacts: [
            {
              target: 'cursor' as const,
              file: '1.0.0-cursor.zip',
              sha256: cursorSha256,
            },
            {
              target: 'github-copilot' as const,
              file: '1.0.0-github-copilot.zip',
              sha256: copilotSha256,
            },
          ],
        },
      ],
    }

    const catalog = makeInstallTestCatalog()
    const multiTargetCatalog = {
      ...catalog,
      packages: [
        {
          ...catalog.packages[0],
          installTargets: [
            { id: 'cursor', status: 'supported' as const },
            { id: 'github-copilot', status: 'supported' as const },
          ],
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = toFetchUrl(input)

      if (url.includes('packages/index.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(multiTargetCatalog), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (url.includes('/agents-repo/sample-agent/versions/manifest.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(manifest), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (url.includes('/agents-repo/sample-agent/') && url.includes('metadata.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(makeMultiTargetInstallTestMetadata()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (url.includes('1.0.0-cursor.zip')) {
        return Promise.resolve(new Response(cursorZipBytes, { status: 200 }))
      }

      if (url.includes('1.0.0-github-copilot.zip')) {
        return Promise.resolve(new Response(copilotZipBytes, { status: 200 }))
      }

      return Promise.resolve(new Response('not found', { status: 404 }))
    })
    mockRegistrySource()

    const service = new BulkInstallService()
    const results = await service.runAll({ cwd })

    expect(results).toHaveLength(2)
    expect(results.map((result) => result.target)).toEqual(['github-copilot', 'cursor'])

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<
        string,
        {
          version: string
          byTarget: Record<string, { integrity: string; artifact: string }>
        }
      >
    }
    const entry = lock.packages['agents-repo/sample-agent']
    expect(entry.version).toBe('1.0.0')
    expect(entry.byTarget.cursor.artifact).toBe('1.0.0-cursor.zip')
    expect(entry.byTarget['github-copilot'].artifact).toBe('1.0.0-github-copilot.zip')
  })
})
