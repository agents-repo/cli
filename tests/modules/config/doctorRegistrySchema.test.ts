import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DoctorService } from '../../../src/modules/config/application/doctorService.js'
import { IndexSchemaError } from '../../../src/modules/registry/domain/errors.js'
import { makeInstallTestCatalog } from '../../fixtures/installFixtures.js'

const { loadRegistryCatalogMock } = vi.hoisted(() => ({
  loadRegistryCatalogMock: vi.fn(),
}))

vi.mock('../../../src/modules/registry/infrastructure/registryRepository.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../src/modules/registry/infrastructure/registryRepository.js')
  >()
  return {
    ...actual,
    loadRegistryCatalog: loadRegistryCatalogMock,
  }
})

const writeProject = (cwd: string): void => {
  writeFileSync(
    path.join(cwd, 'agents.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      registry: { url: 'https://registry-proxy.example.workers.dev', ref: 'v2.0.0' },
      targets: ['cursor'],
      packages: {},
    }),
  )
  writeFileSync(
    path.join(cwd, 'agents-lock.json'),
    JSON.stringify({
      lockfileVersion: 2,
      resolvedRef: 'v2.0.0',
      packages: {},
    }),
  )
}

describe('DoctorService registry schemaVersion gate', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    loadRegistryCatalogMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails registry_reachable on other-major index schemaVersion', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-index-major-'))
    tempDirs.push(cwd)
    writeProject(cwd)

    loadRegistryCatalogMock.mockRejectedValue(
      new IndexSchemaError('Unsupported index schemaVersion "2.0.0"', '2.0.0'),
    )

    const result = await new DoctorService().run({ cwd })
    const check = result.checks.find((entry) => entry.id === 'registry_reachable')

    expect(check?.status).toBe('fail')
    expect(check?.code).toBe('index_schema_error')
    expect(result.exitCode).toBe(3)
  })

  it('passes registry_reachable with newer-than-CLI catalog warnings', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-index-newer-'))
    tempDirs.push(cwd)
    writeProject(cwd)

    loadRegistryCatalogMock.mockResolvedValue({
      catalog: makeInstallTestCatalog(),
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      registryBaseUrl: 'https://registry-proxy.example.workers.dev',
      baseUrlRefResolution: null,
      warnings: [
        'Index schemaVersion "1.5.0" is newer than this CLI; consider upgrading agents-repo',
      ],
    })

    const result = await new DoctorService().run({ cwd })
    const check = result.checks.find((entry) => entry.id === 'registry_reachable')

    expect(check?.status).toBe('pass')
    expect(result.warnings).toContain(
      'Index schemaVersion "1.5.0" is newer than this CLI; consider upgrading agents-repo',
    )
    expect(result.exitCode).toBe(0)
  })

  it('passes registry_reachable with deprecated catalog warnings', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-index-deprecated-'))
    tempDirs.push(cwd)
    writeProject(cwd)

    loadRegistryCatalogMock.mockResolvedValue({
      catalog: makeInstallTestCatalog(),
      indexUrl: 'https://registry-proxy.example.workers.dev/packages/index.json?ref=v2.0.0',
      registryBaseUrl: 'https://registry-proxy.example.workers.dev',
      baseUrlRefResolution: null,
      warnings: [
        'Index schemaVersion "1.0.0" is deprecated; consider upgrading catalog consumers',
      ],
    })

    const result = await new DoctorService().run({ cwd })
    const check = result.checks.find((entry) => entry.id === 'registry_reachable')

    expect(check?.status).toBe('pass')
    expect(result.warnings).toContain(
      'Index schemaVersion "1.0.0" is deprecated; consider upgrading catalog consumers',
    )
    expect(result.exitCode).toBe(0)
  })
})
