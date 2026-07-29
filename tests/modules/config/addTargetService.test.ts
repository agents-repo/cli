import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { AddTargetService } from '../../../src/modules/config/application/addTargetService.js'
import { DEFAULT_REGISTRY_CONFIG } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'

describe('AddTargetService', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('appends new target ids in canonical order', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-add-target-'))
    tempDirs.push(cwd)

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: DEFAULT_REGISTRY_CONFIG,
        targets: ['cursor'],
        packages: {},
      }),
    )

    const service = new AddTargetService()
    const result = await service.run({ cwd, targetIds: ['github-copilot'] })

    expect(result.changed).toBe(true)
    expect(result.targets).toEqual(['github-copilot', 'cursor'])

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      targets: string[]
    }
    expect(config.targets).toEqual(['github-copilot', 'cursor'])
  })

  it('ignores duplicate ids in the same add-target invocation', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-add-target-dup-args-'))
    tempDirs.push(cwd)
    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: DEFAULT_REGISTRY_CONFIG,
        targets: ['cursor'],
        packages: {},
      }),
    )

    const service = new AddTargetService()
    const result = await service.run({ cwd, targetIds: ['github-copilot', 'github-copilot'] })

    expect(result.changed).toBe(true)
    expect(result.warnings).toContain('duplicate add-target id ignored: github-copilot')
    expect(result.targets).toEqual(['github-copilot', 'cursor'])
  })

  it('rejects add-target when agents.json is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-add-target-missing-config-'))
    tempDirs.push(cwd)

    const service = new AddTargetService()
    await expect(service.run({ cwd, targetIds: ['cursor'] })).rejects.toMatchObject({
      code: 'missing_config',
    })
  })

  it('returns changed false and warnings for duplicate ids without writing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-add-target-dup-'))
    tempDirs.push(cwd)
    const configPath = path.join(cwd, 'agents.json')
    const original = JSON.stringify({
      schemaVersion: '1.0.0',
      registry: DEFAULT_REGISTRY_CONFIG,
      targets: ['cursor'],
      packages: {},
    })
    writeFileSync(configPath, original)

    const service = new AddTargetService()
    const result = await service.run({ cwd, targetIds: ['cursor'] })

    expect(result.changed).toBe(false)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(readFileSync(configPath, 'utf8')).toBe(original)
  })
})
