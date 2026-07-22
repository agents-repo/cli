import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InstallService } from '../../../src/modules/install/application/installService.js'
import { InstallPersistence } from '../../../src/modules/install/application/installPersistence.js'
import * as registrySourceConfig from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'
import {
  buildCursorSkillZip,
  makeInstallTestCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  withInstallTestArtifactSha256,
} from '../../fixtures/installFixtures.js'

describe('InstallService persistence rollback', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rolls back extracted files when config persistence fails', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-rollback-'))
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
      baseUrlRefResolution: null,
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      let url: string
      if (typeof input === 'string') {
        url = input
      } else if (input instanceof URL) {
        url = input.toString()
      } else {
        url = input.url
      }

      if (url.includes('packages/index.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(makeInstallTestCatalog()), {
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

      if (url.includes('1.0.0-cursor.zip')) {
        return Promise.resolve(new Response(zipBytes, { status: 200 }))
      }

      return Promise.resolve(new Response('not found', { status: 404 }))
    })

    vi.spyOn(InstallPersistence.prototype, 'save').mockRejectedValue(new Error('disk full'))

    const service = new InstallService()

    await expect(
      service.run({
        cwd,
        packageId: 'agents-repo/sample-agent',
      }),
    ).rejects.toThrow('disk full')

    expect(() => readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toThrow()
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow()
  })
})
