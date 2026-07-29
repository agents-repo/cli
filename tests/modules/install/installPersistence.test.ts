import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { InstallPersistence } from '../../../src/modules/install/application/installPersistence.js'
import { resolveLockRef } from '../../../src/modules/install/application/resolveLockRef.js'
import type { ResolvedAgentsConfig } from '../../../src/modules/config/domain/agentsConfig.js'
import { DEFAULT_REGISTRY_CONFIG } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js'

describe('resolveLockRef', () => {
  it('uses alias resolution when available', () => {
    const configDir = mkdtempSync(path.join(os.tmpdir(), 'agents-lock-ref-'))
    const ref = resolveLockRef(
      {
        gateMode: 'greenfield',
        configPath: path.join(configDir, 'agents.json'),
        lockPath: path.join(configDir, 'agents-lock.json'),
        registry: DEFAULT_REGISTRY_CONFIG,
        packages: {},
        configRoot: configDir,
        warnings: [],
        rawDocument: null,
      },
      {
        catalog: { schemaVersion: '1.3.0', updatedAt: '', packages: [] },
        indexUrl: 'https://example.test/packages/index.json?ref=v2.0.0',
        registryBaseUrl: 'https://example.test/?ref=v2.0.0',
        baseUrlRefResolution: { alias: 'v2.x', resolvedRef: 'v2.0.0' },
        warnings: [],
      },
    )

    expect(ref).toBe('v2.0.0')
  })

  it('falls back to a concrete configured ref', () => {
    const configDir = mkdtempSync(path.join(os.tmpdir(), 'agents-lock-ref-concrete-'))
    const ref = resolveLockRef(
      {
        gateMode: 'greenfield',
        configPath: path.join(configDir, 'agents.json'),
        lockPath: path.join(configDir, 'agents-lock.json'),
        registry: { url: 'https://example.test', ref: 'v2.3.1' },
        packages: {},
        configRoot: configDir,
        warnings: [],
        rawDocument: null,
      },
      {
        catalog: { schemaVersion: '1.3.0', updatedAt: '', packages: [] },
        indexUrl: 'https://example.test/packages/index.json?ref=v2.3.1',
        registryBaseUrl: 'https://example.test/?ref=v2.3.1',
        baseUrlRefResolution: null,
        warnings: [],
      },
    )

    expect(ref).toBe('v2.3.1')
  })
})

describe('InstallPersistence', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates agents.json and lock entries on greenfield save', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-persist-'))
    tempDirs.push(cwd)
    const configPath = path.join(cwd, 'agents.json')
    const lockPath = path.join(cwd, 'agents-lock.json')

    const resolved: ResolvedAgentsConfig = {
      gateMode: 'greenfield',
      configPath,
      lockPath,
      configRoot: cwd,
      registry: DEFAULT_REGISTRY_CONFIG,
      targets: ['cursor'],
      packages: {},
      warnings: [],
      rawDocument: null,
    }

    const persistence = new InstallPersistence()
    await persistence.save({
      resolved,
      packageId: 'agents-repo/sample-agent',
      version: '1.0.0',
      target: 'cursor',
      artifact: {
        target: 'cursor',
        file: '1.0.0-cursor.zip',
        sha256: 'a'.repeat(64),
      },
      resolvedRef: 'v2.0.0',
      adHocInstall: true,
    })

    const config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      resolvedRef: string
      packages: Record<string, { version: string }>
    }

    expect(config.targets).toEqual(['cursor'])
    expect(config.packages).toEqual({ 'agents-repo/sample-agent': '^1.0.0' })
    expect(lock.resolvedRef).toBe('v2.0.0')
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.0.0')
  })

  it('updates lock for an existing configured package without changing its range', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-persist-update-'))
    tempDirs.push(cwd)
    const configPath = path.join(cwd, 'agents.json')
    const lockPath = path.join(cwd, 'agents-lock.json')

    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: DEFAULT_REGISTRY_CONFIG,
        targets: ['cursor'],
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    )

    const resolved: ResolvedAgentsConfig = {
      gateMode: 'top-level-ours',
      configPath,
      lockPath,
      registry: DEFAULT_REGISTRY_CONFIG,
      targets: ['cursor'],
      packages: { 'agents-repo/sample-agent': '^1.0.0' },
      configRoot: cwd,
      warnings: [],
      rawDocument: JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>,
    }

    const persistence = new InstallPersistence()
    await persistence.save({
      resolved,
      packageId: 'agents-repo/sample-agent',
      version: '1.1.0',
      target: 'cursor',
      artifact: {
        target: 'cursor',
        file: '1.1.0-cursor.zip',
        sha256: 'b'.repeat(64),
      },
      resolvedRef: 'v2.0.0',
      adHocInstall: false,
    })

    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      packages: Record<string, string>
    }
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packages: Record<string, { version: string }>
    }

    expect(config.packages['agents-repo/sample-agent']).toBe('^1.0.0')
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.1.0')
  })

  it('preserves unrelated lock packages when saving a new install', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-persist-lock-merge-'))
    tempDirs.push(cwd)
    const configPath = path.join(cwd, 'agents.json')
    const lockPath = path.join(cwd, 'agents-lock.json')

    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: DEFAULT_REGISTRY_CONFIG,
        targets: ['cursor'],
        packages: {},
      }),
    )

    writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/other-agent': {
            version: '2.0.0',
            byTarget: {
              cursor: {
                integrity: `sha256-${'c'.repeat(64)}`,
                artifact: '2.0.0-cursor.zip',
              },
            },
          },
        },
      }),
    )

    const resolved: ResolvedAgentsConfig = {
      gateMode: 'top-level-ours',
      configPath,
      lockPath,
      registry: DEFAULT_REGISTRY_CONFIG,
      targets: ['cursor'],
      packages: {},
      configRoot: cwd,
      warnings: [],
      rawDocument: JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>,
    }

    const persistence = new InstallPersistence()
    await persistence.save({
      resolved,
      packageId: 'agents-repo/sample-agent',
      version: '1.0.0',
      target: 'cursor',
      artifact: {
        target: 'cursor',
        file: '1.0.0-cursor.zip',
        sha256: 'a'.repeat(64),
      },
      resolvedRef: 'v2.0.0',
      adHocInstall: true,
    })

    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packages: Record<string, { version: string }>
    }

    expect(lock.packages['agents-repo/other-agent'].version).toBe('2.0.0')
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.0.0')
  })

  it('does not write agents.json when the existing lock file is invalid', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-persist-lock-invalid-'))
    tempDirs.push(cwd)
    const configPath = path.join(cwd, 'agents.json')
    const lockPath = path.join(cwd, 'agents-lock.json')

    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: DEFAULT_REGISTRY_CONFIG,
        targets: ['cursor'],
        packages: {},
      }),
    )
    writeFileSync(lockPath, '{ invalid json')

    const resolved: ResolvedAgentsConfig = {
      gateMode: 'top-level-ours',
      configPath,
      lockPath,
      registry: DEFAULT_REGISTRY_CONFIG,
      targets: ['cursor'],
      packages: {},
      configRoot: cwd,
      warnings: [],
      rawDocument: JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>,
    }

    const persistence = new InstallPersistence()
    const originalConfig = readFileSync(configPath, 'utf8')

    await expect(
      persistence.save({
        resolved,
        packageId: 'agents-repo/sample-agent',
        version: '1.0.0',
        target: 'cursor',
        artifact: {
          target: 'cursor',
          file: '1.0.0-cursor.zip',
          sha256: 'a'.repeat(64),
        },
        resolvedRef: 'v2.0.0',
        adHocInstall: true,
      }),
    ).rejects.toThrow()

    expect(readFileSync(configPath, 'utf8')).toBe(originalConfig)
  })

  it('writes multiple ad-hoc package ranges in one saveBulk', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-persist-multi-adhoc-'))
    tempDirs.push(cwd)
    const configPath = path.join(cwd, 'agents.json')
    const lockPath = path.join(cwd, 'agents-lock.json')

    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: DEFAULT_REGISTRY_CONFIG,
        targets: ['cursor'],
        packages: {},
      }),
    )

    const resolved: ResolvedAgentsConfig = {
      gateMode: 'top-level-ours',
      configPath,
      lockPath,
      registry: DEFAULT_REGISTRY_CONFIG,
      targets: ['cursor'],
      packages: {},
      configRoot: cwd,
      warnings: [],
      rawDocument: JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>,
    }

    const persistence = new InstallPersistence()
    await persistence.saveBulk({
      resolved,
      resolvedRef: 'v2.0.0',
      writeLock: true,
      adHocPackageRanges: {
        'agents-repo/foo': '^1.0.0',
        'agents-repo/bar': '^2.0.0',
      },
      entries: [
        {
          packageId: 'agents-repo/foo',
          version: '1.0.0',
          target: 'cursor',
          artifact: {
            target: 'cursor',
            file: '1.0.0-cursor.zip',
            sha256: 'e'.repeat(64),
          },
        },
        {
          packageId: 'agents-repo/bar',
          version: '2.0.0',
          target: 'cursor',
          artifact: {
            target: 'cursor',
            file: '2.0.0-cursor.zip',
            sha256: 'f'.repeat(64),
          },
        },
      ],
    })

    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      packages: Record<string, string>
    }
    expect(config.packages).toEqual({
      'agents-repo/foo': '^1.0.0',
      'agents-repo/bar': '^2.0.0',
    })
  })

  it('writes global install state under agents repo home without touching project cwd files', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-install-global-state-home-'))
    tempDirs.push(homeDir)
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-global-state-'))
    tempDirs.push(cwd)

    const globalRoot = path.join(homeDir, '.agents-repo')
    const configPath = path.join(globalRoot, 'agents.json')
    const lockPath = path.join(globalRoot, 'agents-lock.json')

    const resolved: ResolvedAgentsConfig = {
      gateMode: 'greenfield',
      configPath,
      lockPath,
      configRoot: globalRoot,
      registry: DEFAULT_REGISTRY_CONFIG,
      targets: ['cursor'],
      packages: {},
      warnings: [],
      rawDocument: null,
    }

    const persistence = new InstallPersistence()
    await persistence.save({
      resolved,
      packageId: 'agents-repo/sample-agent',
      version: '1.0.0',
      target: 'cursor',
      artifact: {
        target: 'cursor',
        file: '1.0.0-cursor.zip',
        sha256: 'd'.repeat(64),
      },
      resolvedRef: 'v2.0.0',
      adHocInstall: true,
    })

    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packages: Record<string, { version: string }>
    }
    expect(lock.packages['agents-repo/sample-agent']?.version).toBe('1.0.0')
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow()
  })
})
