import { RegistryFetchError } from '../../registry/domain/errors.js'
import {
  resolveArtifactCacheRoot,
  resolveContentBlobPath,
} from './artifactCachePaths.js'
import {
  shouldReadArtifactCache,
  shouldWriteArtifactCache,
} from './artifactCachePolicy.js'
import { deleteBlob, readBlobIfExists, writeBlobAtomic } from './artifactCacheStore.js'
import { verifySha256 } from './sha256Verifier.js'

export interface DownloadArtifactOptions {
  readonly signal?: AbortSignal
  readonly expectedSha256Hex: string
  readonly writeCache?: boolean
  readonly preferOnline?: boolean
  readonly env?: NodeJS.ProcessEnv
}

const fetchArtifactBytes = async (
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
    throw new RegistryFetchError(
      error instanceof Error ? error.message : 'Unknown artifact download error',
    )
  }

  if (!response.ok) {
    throw new RegistryFetchError(
      `Artifact download failed (${response.status} ${response.statusText})`,
      response.status,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export const downloadArtifact = async (
  artifactUrl: string,
  options: DownloadArtifactOptions,
): Promise<Buffer> => {
  const env = options.env ?? process.env
  const writeCache = options.writeCache !== false
  const preferOnline = options.preferOnline === true
  const expectedSha256Hex = options.expectedSha256Hex

  const verifyOnce = (bytes: Buffer): Buffer => {
    verifySha256(bytes, expectedSha256Hex)
    return bytes
  }

  const cacheRoot = resolveArtifactCacheRoot(env)
  const blobPath = resolveContentBlobPath(cacheRoot, expectedSha256Hex)
  const canReadCache = shouldReadArtifactCache(env, preferOnline)
  const canWriteCache = shouldWriteArtifactCache(env, writeCache)

  if (canReadCache) {
    const cachedBytes = await readBlobIfExists(blobPath)

    if (cachedBytes !== null) {
      try {
        return verifyOnce(cachedBytes)
      } catch {
        try {
          await deleteBlob(blobPath)
        } catch {
          // Best-effort stale entry removal; refetch from network below.
        }
      }
    }
  }

  const networkBytes = await fetchArtifactBytes(artifactUrl, options.signal)
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
