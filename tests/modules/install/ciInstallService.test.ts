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

    const ci = new CiInstallService()
    const results = await ci.run({ cwd })

    expect(results).toHaveLength(2)
    expect(results.every((result) => result.saved === false && result.noSave === true)).toBe(true)
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain('name: sample')
    expect(readFileSync(path.join(cwd, 'agents.json'), 'utf8')).toBe(configBefore)
    expect(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toBe(lockBefore)
  })

  it('overwrites modified managed files when re-running ci', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-overwrite-modified-'))
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

    const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md')
    writeFileSync(skillPath, 'local edit before ci\n')

    const ci = new CiInstallService()
    await ci.run({ cwd })

    expect(readFileSync(skillPath, 'utf8')).toContain('name: sample')
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

  it('installs each configured target from lock on multi-target projects', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-multitarget-'))
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

    await new BulkInstallService().runAll({ cwd })
    rmSync(path.join(cwd, '.cursor'), { recursive: true, force: true })
    rmSync(path.join(cwd, '.github'), { recursive: true, force: true })

    const ci = new CiInstallService()
    const results = await ci.run({ cwd })

    expect(results).toHaveLength(2)
    expect(results.map((result) => result.target).sort((left, right) => left.localeCompare(right))).toEqual([
      'cursor',
      'github-copilot',
    ])
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain('name: sample')
    expect(readFileSync(path.join(cwd, '.github/agents/sample.agent.md'), 'utf8')).toContain('name: sample')
  })

  it('does not install lock byTarget slots for targets omitted from agents.json', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-orphan-slot-'))
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

    await new BulkInstallService().runAll({ cwd })

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      targets: string[]
    }
    config.targets = ['cursor']
    writeFileSync(path.join(cwd, 'agents.json'), JSON.stringify(config))

    rmSync(path.join(cwd, '.cursor'), { recursive: true, force: true })
    rmSync(path.join(cwd, '.github'), { recursive: true, force: true })

    const fetchSpy = vi.mocked(globalThis.fetch)
    const copilotFetchCallsBefore = fetchSpy.mock.calls.filter((call) =>
      toFetchUrl(call[0]).includes('1.0.0-github-copilot.zip'),
    ).length

    const ci = new CiInstallService()
    const results = await ci.run({ cwd })

    expect(results).toHaveLength(1)
    expect(results[0]?.target).toBe('cursor')
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain('name: sample')
    expect(() => readFileSync(path.join(cwd, '.github/agents/sample.agent.md'), 'utf8')).toThrow()

    const copilotFetchCallsAfter = fetchSpy.mock.calls.filter((call) =>
      toFetchUrl(call[0]).includes('1.0.0-github-copilot.zip'),
    ).length
    expect(copilotFetchCallsAfter).toBe(copilotFetchCallsBefore)
  })
})
