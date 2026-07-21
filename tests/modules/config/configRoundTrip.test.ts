import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ConfigMerger } from '../../../src/modules/config/application/configMerger.js'
import { ConfigResolver } from '../../../src/modules/config/application/configResolver.js'
import { SchemaGate } from '../../../src/modules/config/application/schemaGate.js'
import { AgentsJsonRepository } from '../../../src/modules/config/infrastructure/agentsJsonRepository.js'
import { parseJsonDocument, stringifyJsonDocument } from '../../../src/modules/config/infrastructure/jsonDocument.js'
import { foreignOnlyConfig, namespaceConfig } from '../../fixtures/agentsJson/index.js'

const parseWritten = async (filePath: string): Promise<Record<string, unknown>> => {
  const content = await readFile(filePath, 'utf8')
  return parseJsonDocument(content, 'agents.json')
}

describe('config round-trip integration', () => {
  const resolver = new ConfigResolver()
  const merger = new ConfigMerger()
  const repository = new AgentsJsonRepository()
  const gate = new SchemaGate()

  it('greenfield create then resolve', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-roundtrip-'))
    const configPath = path.join(cwd, 'agents.json')

    const merged = merger.merge(null, { target: 'cursor' }, { gateMode: 'greenfield' })
    await repository.write(configPath, merged)

    const resolved = await resolver.resolve({ cwd, env: {} })
    expect(resolved.gateMode).toBe('top-level-ours')
    expect(resolved.target).toBe('cursor')
    expect(resolved.packages).toEqual({})
  })

  it('foreign-only file then namespace merge write', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-roundtrip-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(configPath, stringifyJsonDocument(foreignOnlyConfig))

    const initial = await resolver.resolve({ cwd, env: {} })
    expect(initial.gateMode).toBe('namespace')

    const merged = merger.merge(
      foreignOnlyConfig,
      { target: 'cursor', packages: { 'agents-repo/hello-agent': '^1.0.0' } },
      { gateMode: 'namespace' },
    )
    await repository.write(configPath, merged)

    const written = await parseWritten(configPath)
    expect(written.customTool).toEqual(foreignOnlyConfig.customTool)
    expect(written['@agents-repo']).toMatchObject({
      target: 'cursor',
      packages: { 'agents-repo/hello-agent': '^1.0.0' },
    })
    expect(written.schemaVersion).toBeUndefined()
  })

  it('resolves @agents-repo-only block', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-roundtrip-'))
    const configPath = path.join(cwd, 'agents.json')
    await writeFile(configPath, stringifyJsonDocument(namespaceConfig))

    const resolved = await resolver.resolve({ cwd, env: {} })
    expect(gate.determineMode(namespaceConfig)).toBe('namespace')
    expect(resolved.target).toBe('cursor')
    expect(resolved.packages).toEqual({ 'agents-repo/hello-agent': '^1.0.0' })
  })

  it('top-level-ours with conflicting @agents-repo definitions', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-roundtrip-'))
    const configPath = path.join(cwd, 'agents.json')
    const document = {
      schemaVersion: '1.0.0',
      target: 'cursor',
      packages: {},
      registry: { url: 'https://registry-proxy.maiconfz.workers.dev', ref: 'v2.x' },
      '@agents-repo': {
        target: 'claude-code',
      },
    }
    await writeFile(configPath, stringifyJsonDocument(document))

    await expect(resolver.resolve({ cwd, env: {} })).rejects.toMatchObject({
      code: 'dual_definition_mismatch',
      exitCode: 4,
    })

    const resolved = await resolver.resolve({ cwd, env: {}, waiveConflicts: true })
    expect(resolved.target).toBe('cursor')
  })
})
