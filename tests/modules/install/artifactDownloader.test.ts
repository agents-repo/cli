import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { ENV_AGENTS_REPO_NO_CACHE } from '../../../src/modules/config/domain/configConstants.js'
import { resolveContentBlobPath } from '../../../src/modules/install/infrastructure/artifactCachePaths.js'
import * as artifactCacheStore from '../../../src/modules/install/infrastructure/artifactCacheStore.js'
import { downloadArtifact } from '../../../src/modules/install/infrastructure/artifactDownloader.js'

const sampleBytes = Buffer.from('sample-zip-bytes')
const sampleSha256 = createHash('sha256').update(sampleBytes).digest('hex')

describe('downloadArtifact cache', () => {
  let tempHome: string
  let fetchSpy: MockInstance<typeof fetch>
  let previousNoCache: string | undefined

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'agents-artifact-cache-'))
    previousNoCache = process.env[ENV_AGENTS_REPO_NO_CACHE]
    delete process.env[ENV_AGENTS_REPO_NO_CACHE]
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(sampleBytes, { status: 200 })),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tempHome, { recursive: true, force: true })
    if (previousNoCache === undefined) {
      delete process.env[ENV_AGENTS_REPO_NO_CACHE]
    } else {
      process.env[ENV_AGENTS_REPO_NO_CACHE] = previousNoCache
    }
  })

  const env = (): NodeJS.ProcessEnv => ({
    ...process.env,
    AGENTS_REPO_HOME: tempHome,
  })

  it('writes npm-style content blob on cache miss', async () => {
    const bytes = await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: env(),
    })

    expect(bytes.equals(sampleBytes)).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const blobPath = resolveContentBlobPath(path.join(tempHome, 'cache'), sampleSha256)
    expect(existsSync(blobPath)).toBe(true)
    expect(readFileSync(blobPath).equals(sampleBytes)).toBe(true)
  })

  it('returns cached bytes without fetch on hit', async () => {
    const firstEnv = env()
    await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: firstEnv,
    })

    fetchSpy.mockClear()

    const bytes = await downloadArtifact('https://example.test/other-url.zip', {
      expectedSha256Hex: sampleSha256,
      env: firstEnv,
    })

    expect(bytes.equals(sampleBytes)).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('deletes corrupt cache entry and refetches', async () => {
    const testEnv = env()
    const blobPath = resolveContentBlobPath(path.join(tempHome, 'cache'), sampleSha256)
    mkdirSync(path.dirname(blobPath), { recursive: true })
    writeFileSync(blobPath, Buffer.from('corrupt'))

    await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: testEnv,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(readFileSync(blobPath).equals(sampleBytes)).toBe(true)
  })

  it('skips cache when AGENTS_REPO_NO_CACHE is set', async () => {
    const testEnv = {
      ...env(),
      [ENV_AGENTS_REPO_NO_CACHE]: '1',
    }

    await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: testEnv,
    })

    fetchSpy.mockClear()

    await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: testEnv,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(existsSync(path.join(tempHome, 'cache'))).toBe(false)
  })

  it('skips cache read when preferOnline is set but still writes', async () => {
    const testEnv = env()
    await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: testEnv,
    })

    fetchSpy.mockClear()

    await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      preferOnline: true,
      env: testEnv,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not write cache when writeCache is false', async () => {
    await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      writeCache: false,
      env: env(),
    })

    expect(existsSync(path.join(tempHome, 'cache'))).toBe(false)
  })

  it('returns verified bytes when cache write fails', async () => {
    vi.spyOn(artifactCacheStore, 'writeBlobAtomic').mockRejectedValue(new Error('disk full'))

    const bytes = await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: env(),
    })

    expect(bytes.equals(sampleBytes)).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('accepts uppercase expected digest hex', async () => {
    const bytes = await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256.toUpperCase(),
      env: env(),
    })

    expect(bytes.equals(sampleBytes)).toBe(true)
  })

  it('refetches when corrupt cache cannot be deleted', async () => {
    const testEnv = env()
    const blobPath = resolveContentBlobPath(path.join(tempHome, 'cache'), sampleSha256)
    mkdirSync(path.dirname(blobPath), { recursive: true })
    writeFileSync(blobPath, Buffer.from('corrupt'))

    vi.spyOn(artifactCacheStore, 'deleteBlob').mockRejectedValue(new Error('permission denied'))

    const bytes = await downloadArtifact('https://example.test/artifact.zip', {
      expectedSha256Hex: sampleSha256,
      env: testEnv,
    })

    expect(bytes.equals(sampleBytes)).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
