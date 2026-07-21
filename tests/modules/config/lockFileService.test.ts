import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { LockFileService } from '../../../src/modules/config/application/lockFileService.js'
import { LockValidationError, ConfigParseError } from '../../../src/modules/config/domain/configErrors.js'
import { stringifyJsonDocument } from '../../../src/modules/config/infrastructure/jsonDocument.js'

const validLock = {
  lockfileVersion: 1,
  resolvedRef: 'v2.3.1',
  packages: {
    'agents-repo/hello-agent': {
      version: '1.0.0',
      target: 'cursor',
      integrity: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      artifact: '1.0.0-cursor.zip',
    },
  },
} as const

describe('LockFileService', () => {
  const service = new LockFileService()

  it('returns null when lock file is missing', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await expect(service.read(lockPath)).resolves.toBeNull()
  })

  it('reads and validates a valid lock file', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(lockPath, stringifyJsonDocument(validLock))

    const document = await service.read(lockPath)
    expect(document).toEqual(validLock)
  })

  it('throws on unsupported lockfileVersion', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(
      lockPath,
      stringifyJsonDocument({ ...validLock, lockfileVersion: 2 }),
    )

    await expect(service.read(lockPath)).rejects.toBeInstanceOf(LockValidationError)
  })

  it('rejects prerelease package versions', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(
      lockPath,
      stringifyJsonDocument({
        ...validLock,
        packages: {
          'agents-repo/hello-agent': {
            ...validLock.packages['agents-repo/hello-agent'],
            version: '1.0.0-beta.1',
          },
        },
      }),
    )

    await expect(service.read(lockPath)).rejects.toBeInstanceOf(LockValidationError)
  })

  it('accepts a valid RFC 3339 resolved timestamp', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    const lockWithResolved = {
      ...validLock,
      packages: {
        'agents-repo/hello-agent': {
          ...validLock.packages['agents-repo/hello-agent'],
          resolved: '2026-07-21T06:45:00Z',
        },
      },
    }
    await writeFile(lockPath, stringifyJsonDocument(lockWithResolved))

    const document = await service.read(lockPath)
    expect(document).toEqual(lockWithResolved)
  })

  it('rejects invalid resolved timestamps', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(
      lockPath,
      stringifyJsonDocument({
        ...validLock,
        packages: {
          'agents-repo/hello-agent': {
            ...validLock.packages['agents-repo/hello-agent'],
            resolved: 'not-a-date',
          },
        },
      }),
    )

    await expect(service.read(lockPath)).rejects.toBeInstanceOf(LockValidationError)
  })

  it('rejects major-line alias resolvedRef values', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(lockPath, stringifyJsonDocument({ ...validLock, resolvedRef: 'v2.x' }))

    await expect(service.read(lockPath)).rejects.toBeInstanceOf(LockValidationError)
  })

  it('rejects resolvedRef values with surrounding whitespace', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(lockPath, stringifyJsonDocument({ ...validLock, resolvedRef: ' v2.3.1 ' }))

    await expect(service.read(lockPath)).rejects.toBeInstanceOf(LockValidationError)
  })

  it('throws on invalid integrity format', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(
      lockPath,
      stringifyJsonDocument({
        ...validLock,
        packages: {
          'agents-repo/hello-agent': {
            ...validLock.packages['agents-repo/hello-agent'],
            integrity: 'sha256-INVALID',
          },
        },
      }),
    )

    await expect(service.read(lockPath)).rejects.toBeInstanceOf(LockValidationError)
  })

  it('formats integrity with sha256 prefix', () => {
    expect(service.formatIntegrity('a'.repeat(64))).toBe(`sha256-${'a'.repeat(64)}`)
  })

  it('rejects invalid manifest sha256 hex in formatIntegrity', () => {
    expect(() => service.formatIntegrity('not-hex')).toThrow(LockValidationError)
  })

  it('throws on invalid lock JSON', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')
    await writeFile(lockPath, '{invalid', 'utf8')

    await expect(service.read(lockPath)).rejects.toBeInstanceOf(ConfigParseError)
  })

  it('writes stable lock output without resolved timestamps', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-lock-'))
    const lockPath = path.join(cwd, 'agents-lock.json')

    await service.write(lockPath, validLock)
    const reread = await service.read(lockPath)
    expect(reread).toEqual(validLock)
  })
})
