import path from 'node:path'

import { resolveAgentsRepoHome } from '../../config/infrastructure/agentsRepoHome.js'
import { InstallRuntimeError } from '../domain/installErrors.js'

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/

export const normalizeSha256Hex = (sha256Hex: string): string => {
  const normalized = sha256Hex.trim().toLowerCase()

  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new InstallRuntimeError(
      'integrity_mismatch',
      `Invalid SHA-256 hex digest: expected 64 hexadecimal characters`,
    )
  }

  return normalized
}

export const resolveArtifactCacheRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  path.join(resolveAgentsRepoHome(env), 'cache')

export const resolveContentBlobPath = (
  cacheRoot: string,
  sha256Hex: string,
): string => {
  const digest = normalizeSha256Hex(sha256Hex)
  const prefix = digest.slice(0, 2)
  const suffix = digest.slice(2)

  return path.join(cacheRoot, 'content-v2', 'sha256', prefix, suffix)
}
