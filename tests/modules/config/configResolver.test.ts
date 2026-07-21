import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ConfigResolver } from '../../../src/modules/config/application/configResolver.js'
import { DEFAULT_REGISTRY_CONFIG } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'
import {
  ConfigConflictError,
  ConfigValidationError,
} from '../../../src/modules/config/domain/configErrors.js'
import { stringifyJsonDocument } from '../../../src/modules/config/infrastructure/jsonDocument.js'

describe('ConfigResolver', () => {
  const resolver = new ConfigResolver()

  it('returns defaults on greenfield', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const resolved = await resolver.resolve({ cwd, env: {} })

    expect(resolved.gateMode).toBe('greenfield')
    expect(resolved.registry).toEqual(DEFAULT_REGISTRY_CONFIG)
    expect(resolved.packages).toEqual({})
    expect(resolved.global).toBe(false)
    expect(resolved.target).toBeUndefined()
  })

  it('applies AGENTS_REPO_REGISTRY_URL override', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registry: { url: 'https://original.example', ref: 'v2.x' },
        packages: {},
      }),
    )

    const resolved = await resolver.resolve({
      cwd,
      env: { AGENTS_REPO_REGISTRY_URL: 'https://override.example' },
    })

    expect(resolved.registry.url).toBe('https://override.example')
    expect(resolved.registry.ref).toBe('v2.x')
  })

  it('maps registryUrl alias to registry.url', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registryUrl: 'https://legacy.example',
        packages: {},
      }),
    )

    const resolved = await resolver.resolve({ cwd, env: {} })
    expect(resolved.registry).toEqual({ url: 'https://legacy.example', ref: 'v2.x' })
  })

  it('reads namespace-only @agents-repo block', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        other: { enabled: true },
        '@agents-repo': {
          target: 'cursor',
          packages: { 'agents-repo/hello-agent': '^1.0.0' },
        },
      }),
    )

    const resolved = await resolver.resolve({ cwd, env: {} })
    expect(resolved.gateMode).toBe('namespace')
    expect(resolved.target).toBe('cursor')
    expect(resolved.packages).toEqual({ 'agents-repo/hello-agent': '^1.0.0' })
  })

  it('ignores dependencies and only reads packages', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        dependencies: { 'agents-repo/hello-agent': '^9.0.0' },
        packages: { 'agents-repo/hello-agent': '^1.0.0' },
      }),
    )

    const resolved = await resolver.resolve({ cwd, env: {} })
    expect(resolved.packages).toEqual({ 'agents-repo/hello-agent': '^1.0.0' })
  })

  it('throws missing_target when requireTarget is set', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    await expect(resolver.resolve({ cwd, env: {}, requireTarget: true })).rejects.toMatchObject({
      code: 'missing_target',
      exitCode: 3,
    })
  })

  it('waives dual_definition and prefers top-level target', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        target: 'cursor',
        packages: {},
        '@agents-repo': { target: 'claude-code' },
      }),
    )

    const resolved = await resolver.resolve({ cwd, env: {}, waiveConflicts: true })
    expect(resolved.target).toBe('cursor')
    expect(resolved.warnings.some((entry) => entry.code === 'dual_definition_mismatch')).toBe(true)
  })

  it('throws ConfigConflictError when dual_definition is not waived', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        target: 'cursor',
        packages: {},
        '@agents-repo': { target: 'claude-code' },
      }),
    )

    await expect(resolver.resolve({ cwd, env: {} })).rejects.toBeInstanceOf(ConfigConflictError)
  })

  it('rejects relative AGENTS_REPO_CONFIG paths', async () => {
    await expect(
      resolver.resolve({ cwd: process.cwd(), env: { AGENTS_REPO_CONFIG: 'relative/agents.json' } }),
    ).rejects.toBeInstanceOf(ConfigValidationError)
  })

  it('throws on invalid agents.json content', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(configPath, '{not-json', 'utf8')

    await expect(resolver.resolve({ cwd, env: {} })).rejects.toMatchObject({
      code: 'config_parse_error',
      exitCode: 3,
    })
  })

  it('reads @agents-repo when top-level schemaVersion is unsupported', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '9.9.9',
        '@agents-repo': {
          target: 'cursor',
          packages: { 'agents-repo/hello-agent': '^1.0.0' },
        },
      }),
    )

    const resolved = await resolver.resolve({ cwd, env: {} })
    expect(resolved.gateMode).toBe('namespace')
    expect(resolved.target).toBe('cursor')
    expect(resolved.packages).toEqual({ 'agents-repo/hello-agent': '^1.0.0' })
  })

  it('rejects non-object @agents-repo in namespace mode', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        customTool: { enabled: true },
        '@agents-repo': 'cursor',
      }),
    )

    await expect(resolver.resolve({ cwd, env: {} })).rejects.toMatchObject({
      code: 'type_mismatch',
      exitCode: 3,
    })
  })

  it('preserves registry ref when only ref is set in registry object', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-config-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(
      configPath,
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registry: { ref: 'v3.x' },
        packages: {},
      }),
    )

    const resolved = await resolver.resolve({ cwd, env: {} })
    expect(resolved.registry).toEqual({
      url: DEFAULT_REGISTRY_CONFIG.url,
      ref: 'v3.x',
    })
  })
})
