import { RegistryFetchError } from '../../registry/domain/errors.js'
import {
  normalizeSha256Hex,
  resolveArtifactCacheRoot,
  resolveContentBlobPath,
} from './artifactCachePaths.js'
import {
  shouldReadArtifactCache,
  shouldWriteArtifactCache,
} from './artifactCachePolicy.js'
import { deleteBlob, readBlobIfExists, writeBlobAtomic } from './artifactCacheStore.js'
import { verifySha256 } from './sha256Verifier.js'

const ARTIFACT_FETCH_MAX_ATTEMPTS = 3
const ARTIFACT_FETCH_RETRY_BASE_MS = 2000

export interface DownloadArtifactOptions {
  readonly signal?: AbortSignal
  readonly expectedSha256Hex: string
  readonly writeCache?: boolean
  readonly preferOnline?: boolean
  readonly env?: NodeJS.ProcessEnv
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === 'AbortError'

const toAbortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error) {
    return signal.reason
  }

  return new DOMException('This operation was aborted', 'AbortError')
}

const retryDelayMs = (failedAttempt: number): number =>
  ARTIFACT_FETCH_RETRY_BASE_MS * 2 ** (failedAttempt - 1)

const defaultSleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
  if (ms <= 0) {
    return
  }

  if (signal?.aborted) {
    throw toAbortError(signal)
  }

  if (!signal) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })
    return
  }

  const abortSignal = signal
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = (): void => {
      cleanup()
      reject(toAbortError(abortSignal))
    }

    const cleanup = (): void => {
      clearTimeout(timer)
      abortSignal.removeEventListener('abort', onAbort)
    }

    abortSignal.addEventListener('abort', onAbort, { once: true })
  })
}

const toFetchOrAbortError = (error: unknown): Error => {
  if (isAbortError(error)) {
    return error
  }

  return new RegistryFetchError(
    error instanceof Error ? error.message : 'Unknown artifact download error',
  )
}

const fetchArtifactBytesOnce = async (
  artifactUrl: string,
  signal: AbortSignal | undefined,
): Promise<Buffer> => {
  let response: Response

  try {
    response = await fetch(artifactUrl, {
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    throw toFetchOrAbortError(error)
  }

  if (!response.ok) {
    throw new RegistryFetchError(
      `Artifact download failed (${response.status} ${response.statusText})`,
      response.status,
    )
  }

  try {
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    throw toFetchOrAbortError(error)
  }
}

const fetchArtifactBytes = async (
  artifactUrl: string,
  signal: AbortSignal | undefined,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
): Promise<Buffer> => {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= ARTIFACT_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchArtifactBytesOnce(artifactUrl, signal)
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      lastError =
        error instanceof Error
          ? error
          : new RegistryFetchError('Unknown artifact download error')
      if (attempt === ARTIFACT_FETCH_MAX_ATTEMPTS) {
        break
      }

      await sleep(retryDelayMs(attempt), signal)
    }
  }

  throw lastError ?? new RegistryFetchError('Unknown artifact download error')
}

const tryReadVerifiedCache = async (
  blobPath: string,
  verifyOnce: (bytes: Buffer) => Buffer,
): Promise<Buffer | null> => {
  const cachedBytes = await readBlobIfExists(blobPath)
  if (cachedBytes === null) {
    return null
  }

  try {
    return verifyOnce(cachedBytes)
  } catch {
    try {
      await deleteBlob(blobPath)
    } catch {
      // Best-effort stale entry removal; refetch from network below.
    }
  }

  return null
}

export const downloadArtifact = async (
  artifactUrl: string,
  options: DownloadArtifactOptions,
): Promise<Buffer> => {
  const env = options.env ?? process.env
  const writeCache = options.writeCache !== false
  const preferOnline = options.preferOnline === true
  const expectedSha256Hex = normalizeSha256Hex(options.expectedSha256Hex)

  const verifyOnce = (bytes: Buffer): Buffer => {
    verifySha256(bytes, expectedSha256Hex)
    return bytes
  }

  const cacheRoot = resolveArtifactCacheRoot(env)
  const blobPath = resolveContentBlobPath(cacheRoot, expectedSha256Hex)
  const canReadCache = shouldReadArtifactCache(env, preferOnline)
  const canWriteCache = shouldWriteArtifactCache(env, writeCache)

  if (canReadCache) {
    const cached = await tryReadVerifiedCache(blobPath, verifyOnce)
    if (cached !== null) {
      return cached
    }
  }

  const networkBytes = await fetchArtifactBytes(
    artifactUrl,
    options.signal,
    options.sleep ?? defaultSleep,
  )
  const verifiedBytes = verifyOnce(networkBytes)

  if (canWriteCache) {
    try {
      await writeBlobAtomic(blobPath, verifiedBytes)
    } catch {
      // Best-effort cache populate; verified bytes are still returned.
    }
  }

  return verifiedBytes
}
