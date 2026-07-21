import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { InitService } from '../../../src/modules/config/application/initService.js'
import {
  ConfigValidationError,
} from '../../../src/modules/config/domain/configErrors.js'
import { stringifyJsonDocument } from '../../../src/modules/config/infrastructure/jsonDocument.js'
import { ProjectTargetDetector } from '../../../src/modules/target/application/projectTargetDetector.js'
import type { TargetDetectionResult } from '../../../src/modules/target/domain/targetDetection.js'
import { DEFAULT_REGISTRY_CONFIG } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'
import {
  canonicalTopLevelConfig,
  conflictingTopLevelConfig,
  foreignOnlyConfig,
  namespaceOnlyTargetConfig,
  partialNamespaceConfig,
  partialNamespaceNoTargetConfig,
} from '../../fixtures/agentsJson/index.js'

const createProjectDir = async (): Promise<string> => {
  return mkdtemp(path.join(os.tmpdir(), 'agents-init-'))
}

const writeAgentsJson = async (cwd: string, document: Record<string, unknown>): Promise<string> => {
  const configPath = path.join(cwd, 'agents.json')
  await writeFile(configPath, stringifyJsonDocument(document))
  return configPath
}

const readAgentsJson = async (configPath: string): Promise<Record<string, unknown>> => {
  const content = await readFile(configPath, 'utf8')
  return JSON.parse(content) as Record<string, unknown>
}

const stubDetector = (result: TargetDetectionResult): ProjectTargetDetector => {
  return {
    detect: () => Promise.resolve(result),
  } as unknown as ProjectTargetDetector
}

const noneDetection: TargetDetectionResult = {
  status: 'none',
  detected: [],
  matches: [],
}

const singleCursorDetection: TargetDetectionResult = {
  status: 'single',
  detected: ['cursor'],
  matches: [{ target: 'cursor', markers: ['.cursor'] }],
  suggestedTarget: 'cursor',
}

const ambiguousDetection: TargetDetectionResult = {
  status: 'ambiguous',
  detected: ['cursor', 'claude-code'],
  matches: [
    { target: 'cursor', markers: ['.cursor'] },
    { target: 'claude-code', markers: ['.claude'] },
  ],
}

describe('InitService', () => {
  it('creates a greenfield top-level config with --target', async () => {
    const cwd = await createProjectDir()
    const service = new InitService(stubDetector(noneDetection))

    const result = await service.run({ cwd, target: 'cursor' })

    expect(result.created).toBe(true)
    expect(result.gateMode).toBe('greenfield')
    expect(result.target).toBe('cursor')

    const written = await readAgentsJson(result.configPath)
    expect(written).toEqual({
      schemaVersion: '1.0.0',
      registry: DEFAULT_REGISTRY_CONFIG,
      packages: {},
      target: 'cursor',
    })
  })

  it('uses detected target on greenfield when --target is omitted', async () => {
    const cwd = await createProjectDir()
    const service = new InitService(stubDetector(singleCursorDetection))

    const result = await service.run({ cwd })

    expect(result.target).toBe('cursor')
    const written = await readAgentsJson(result.configPath)
    expect(written.target).toBe('cursor')
  })

  it('rejects greenfield init when target cannot be resolved', async () => {
    const cwd = await createProjectDir()
    const service = new InitService(stubDetector(noneDetection))

    await expect(service.run({ cwd })).rejects.toMatchObject({
      code: 'missing_target',
      exitCode: 3,
    })
  })

  it('merges into @agents-repo for foreign-only files', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, foreignOnlyConfig)
    const service = new InitService(stubDetector(noneDetection))

    const result = await service.run({ cwd, target: 'cursor' })

    expect(result.gateMode).toBe('namespace')
    const written = await readAgentsJson(result.configPath)
    expect(written.customTool).toEqual(foreignOnlyConfig.customTool)
    expect(written['@agents-repo']).toMatchObject({
      schemaVersion: '1.0.0',
      target: 'cursor',
      registry: DEFAULT_REGISTRY_CONFIG,
      packages: {},
    })
    expect(written.schemaVersion).toBeUndefined()
  })

  it('completes a partial @agents-repo namespace block', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, partialNamespaceConfig)
    const service = new InitService(stubDetector(noneDetection))

    await service.run({ cwd })

    const written = await readAgentsJson(path.join(cwd, 'agents.json'))
    expect(written.customTool).toEqual(partialNamespaceConfig.customTool)
    expect(written['@agents-repo']).toMatchObject({
      schemaVersion: '1.0.0',
      target: 'cursor',
      registry: DEFAULT_REGISTRY_CONFIG,
      packages: {},
    })
  })

  it('throws conflict error for dual target definitions without --yes', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, conflictingTopLevelConfig)
    const service = new InitService(stubDetector(noneDetection))

    await expect(service.run({ cwd, target: 'cursor' })).rejects.toMatchObject({
      exitCode: 4,
    })
  })

  it('waives dual target conflicts with --yes', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, conflictingTopLevelConfig)
    const service = new InitService(stubDetector(noneDetection))

    const result = await service.run({ cwd, target: 'cursor', yes: true })

    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.target).toBe('cursor')
  })

  it('rejects --target that differs from existing managed target without --force', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, canonicalTopLevelConfig)
    const service = new InitService(stubDetector(noneDetection))

    await expect(service.run({ cwd, target: 'claude-code' })).rejects.toMatchObject({
      code: 'target_mismatch',
      exitCode: 3,
    })
  })

  it('overwrites managed target with --force and --target', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, canonicalTopLevelConfig)
    const service = new InitService(stubDetector(noneDetection))

    const result = await service.run({ cwd, target: 'claude-code', force: true })

    expect(result.target).toBe('claude-code')
    const written = await readAgentsJson(result.configPath)
    expect(written.target).toBe('claude-code')
    expect(written.packages).toEqual(canonicalTopLevelConfig.packages)
  })

  it('succeeds on re-init without changing managed fields', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, canonicalTopLevelConfig)
    const service = new InitService(stubDetector(noneDetection))

    const result = await service.run({ cwd })

    expect(result.created).toBe(false)
    expect(result.target).toBe('cursor')
    const written = await readAgentsJson(result.configPath)
    expect(written.target).toBe('cursor')
    expect(written.packages).toEqual(canonicalTopLevelConfig.packages)
  })

  it('rejects invalid --target values', async () => {
    const cwd = await createProjectDir()
    const service = new InitService(stubDetector(noneDetection))

    await expect(service.run({ cwd, target: 'unknown-target' })).rejects.toMatchObject({
      code: 'invalid_enum',
      exitCode: 3,
    })
  })

  it('rejects invalid existing managed shape before write', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, {
      schemaVersion: '1.0.0',
      packages: [],
      registry: DEFAULT_REGISTRY_CONFIG,
    })
    const service = new InitService(stubDetector(noneDetection))

    await expect(service.run({ cwd, target: 'cursor' })).rejects.toBeInstanceOf(
      ConfigValidationError,
    )
  })

  it('rejects ambiguous target detection without --target', async () => {
    const cwd = await createProjectDir()
    const service = new InitService(stubDetector(ambiguousDetection))

    await expect(service.run({ cwd })).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof ConfigValidationError &&
        error.code === 'missing_target' &&
        error.exitCode === 3 &&
        error.message.includes('cursor, claude-code')
      )
    })
  })

  it('includes marker paths in ambiguous detection errors when verbose', async () => {
    const cwd = await createProjectDir()
    const service = new InitService(stubDetector(ambiguousDetection))

    await expect(service.run({ cwd, verbose: true })).rejects.toSatisfy((error: unknown) => {
      return error instanceof ConfigValidationError && error.message.includes('.cursor')
    })
  })

  it('treats an on-disk empty object as a bootstrap create', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, {})
    const service = new InitService(stubDetector(noneDetection))

    const result = await service.run({ cwd, target: 'cursor' })

    expect(result.created).toBe(true)
    expect(result.gateMode).toBe('greenfield')
  })

  it('writes config to AGENTS_REPO_CONFIG while detecting targets from cwd', async () => {
    const projectRoot = await createProjectDir()
    const configDir = path.join(projectRoot, 'config')
    await mkdir(configDir, { recursive: true })
    const configPath = path.join(configDir, 'agents.json')
    await mkdir(path.join(projectRoot, '.cursor'), { recursive: true })

    const service = new InitService()
    const result = await service.run({
      cwd: projectRoot,
      env: { AGENTS_REPO_CONFIG: configPath },
    })

    expect(result.configPath).toBe(configPath)
    expect(result.target).toBe('cursor')
    expect(await readAgentsJson(configPath)).toMatchObject({ target: 'cursor' })
    expect(await readFile(path.join(projectRoot, 'agents.json'), 'utf8').catch(() => null)).toBeNull()
  })

  it('detects target for partial namespace block without existing target', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, partialNamespaceNoTargetConfig)
    const service = new InitService(stubDetector(singleCursorDetection))

    const result = await service.run({ cwd })

    expect(result.gateMode).toBe('namespace')
    expect(result.target).toBe('cursor')
    const written = await readAgentsJson(path.join(cwd, 'agents.json'))
    expect(written['@agents-repo']).toMatchObject({
      target: 'cursor',
      schemaVersion: '1.0.0',
      registry: DEFAULT_REGISTRY_CONFIG,
      packages: {},
    })
  })

  it('propagates namespace target to top level when top-level target is missing', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, namespaceOnlyTargetConfig)
    const service = new InitService(stubDetector(singleCursorDetection))

    const result = await service.run({ cwd })

    expect(result.gateMode).toBe('top-level-ours')
    expect(result.target).toBe('claude-code')
    const written = await readAgentsJson(result.configPath)
    expect(written.target).toBe('claude-code')
    expect(written['@agents-repo']).toMatchObject({ target: 'claude-code' })
  })

  it('rejects --target that conflicts with namespace-only target without --force', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, namespaceOnlyTargetConfig)
    const service = new InitService(stubDetector(noneDetection))

    await expect(service.run({ cwd, target: 'cursor' })).rejects.toMatchObject({
      code: 'target_mismatch',
      exitCode: 3,
    })
  })

  it('rejects --force target changes that create dual-definition mismatches without --yes', async () => {
    const cwd = await createProjectDir()
    await writeAgentsJson(cwd, namespaceOnlyTargetConfig)
    const service = new InitService(stubDetector(noneDetection))

    await expect(service.run({ cwd, target: 'cursor', force: true })).rejects.toMatchObject({
      exitCode: 4,
    })
  })

  it('detects cursor from filesystem markers in project root', async () => {
    const cwd = await createProjectDir()
    await mkdir(path.join(cwd, '.cursor'), { recursive: true })
    const service = new InitService()

    const result = await service.run({ cwd })

    expect(result.target).toBe('cursor')
  })
})
