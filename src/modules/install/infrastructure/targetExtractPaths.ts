import path from 'node:path'

import type { InstallTargetId } from '../../registry/domain/package.js'

const AGENTS_DIR = 'agents'
const GITHUB_AGENTS_DIR = '.github/agents'

export const mapZipEntryToExtractPath = (
  targetId: InstallTargetId,
  zipEntryName: string,
): string => {
  if (targetId === 'github-copilot' && zipEntryName.startsWith(`${AGENTS_DIR}/`)) {
    return pathJoin(GITHUB_AGENTS_DIR, zipEntryName.slice(AGENTS_DIR.length + 1))
  }

  return zipEntryName
}

const pathJoin = (...segments: string[]): string => segments.join('/')

export const hasTraversalPattern = (name: string): boolean => {
  if (
    name.includes('\0') ||
    name.startsWith('/') ||
    name.includes('\\') ||
    /^[A-Za-z]:/.test(name)
  ) {
    return true
  }

  return name.split('/').includes('..')
}

export const assertZipEntryPathSafe = (name: string): void => {
  if (hasTraversalPattern(name)) {
    throw new Error(`Unsafe archive entry path: ${name}`)
  }
}

export const resolveContainedExtractPath = (extractRoot: string, relativePath: string): string => {
  assertZipEntryPathSafe(relativePath)

  const resolvedRoot = path.resolve(extractRoot)
  const destination = path.resolve(resolvedRoot, relativePath)
  if (destination !== resolvedRoot && !destination.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Archive entry escapes extract root: ${relativePath}`)
  }

  return destination
}
