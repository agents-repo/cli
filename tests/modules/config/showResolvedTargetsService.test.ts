import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ShowResolvedTargetsService } from '../../../src/modules/config/application/showResolvedTargetsService.js'
import { stringifyJsonDocument } from '../../../src/modules/config/infrastructure/jsonDocument.js'
import {
  conflictingTopLevelConfig,
  legacyTargetOnlyConfig,
} from '../../fixtures/agentsJson/index.js'

describe('ShowResolvedTargetsService', () => {
  it('returns empty targets when agents.json is missing (greenfield)', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-targets-svc-greenfield-'))

    const service = new ShowResolvedTargetsService()
    const result = await service.run({ cwd, env: {} })

    expect(result.scope).toBe('project')
    expect(result.rootPath).toBe(cwd)
    expect(result.gateMode).toBe('greenfield')
    expect(result.targets).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('returns canonical targets from project agents.json', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-targets-svc-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['github-copilot', 'cursor'],
        packages: {},
      }),
    )

    const service = new ShowResolvedTargetsService()
    const result = await service.run({ cwd, env: {} })

    expect(result.scope).toBe('project')
    expect(result.rootPath).toBe(cwd)
    expect(result.gateMode).toBe('top-level-ours')
    expect(result.targets).toEqual(['github-copilot', 'cursor'])
    expect(result.warnings).toEqual([])
  })

  it('returns empty targets when targets key is absent', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-targets-svc-empty-'))
    await writeFile(
      path.join(cwd, 'agents.json'),
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        packages: {},
      }),
    )

    const service = new ShowResolvedTargetsService()
    const result = await service.run({ cwd, env: {} })

    expect(result.targets).toEqual([])
  })

  it('rejects deprecated managed target field', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-targets-svc-legacy-'))
    await writeFile(
      path.join(cwd, 'agents.json'),
      stringifyJsonDocument(legacyTargetOnlyConfig),
    )

    const service = new ShowResolvedTargetsService()
    await expect(service.run({ cwd, env: {} })).rejects.toMatchObject({
      code: 'deprecated_field',
      exitCode: 3,
    })
  })

  it('waives dual-definition mismatch with yes and returns top-level targets', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-targets-svc-dual-'))
    await writeFile(
      path.join(cwd, 'agents.json'),
      stringifyJsonDocument(conflictingTopLevelConfig),
    )

    const service = new ShowResolvedTargetsService()
    const result = await service.run({ cwd, env: {}, yes: true })

    expect(result.targets).toEqual(['cursor'])
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('reads targets from global agents.json when global is set', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'agents-targets-svc-global-home-'))
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-targets-svc-global-cwd-'))
    const globalDir = path.join(homeDir, '.agents-repo')
    await mkdir(globalDir, { recursive: true })
    await writeFile(
      path.join(globalDir, 'agents.json'),
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {},
      }),
    )

    const service = new ShowResolvedTargetsService()
    const result = await service.run({
      cwd,
      env: { ...process.env, HOME: homeDir },
      global: true,
    })

    expect(result.scope).toBe('global')
    expect(result.targets).toEqual(['cursor'])
  })
})
