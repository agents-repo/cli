import type { InstallTargetId } from '../../registry/domain/package.js'
import { InstallRuntimeError } from './installErrors.js'
import {
  LEGACY_CLAUDE_ENTRY_PATTERN,
  LEGACY_SKILL_ENTRY_PATTERN,
  QUALIFIED_CLAUDE_ENTRY_PATTERN,
  QUALIFIED_SKILL_ENTRY_PATTERN,
} from './installPathPatterns.js'

/** Registry manifest `artifacts[].pathEncoding` value for qualified install-leaf ZIPs. */
export const PATH_ENCODING_VERSION = 1

/** Qualified install-leaf string (`namespace--packageName--sourceId`). */
export const computeInstallLeaf = (
  namespace: string,
  packageName: string,
  sourceId: string,
): string => `${namespace}--${packageName}--${sourceId}`

export const resolvePathEncodingVersionFromManifest = (
  pathEncoding: number | undefined,
): number | undefined => {
  if (pathEncoding === undefined) {
    return undefined
  }

  if (pathEncoding === PATH_ENCODING_VERSION) {
    return PATH_ENCODING_VERSION
  }

  throw new InstallRuntimeError(
    'unsupported_path_encoding',
    `Unsupported manifest pathEncoding value: ${pathEncoding}`,
  )
}

export const inferPathEncodingVersionFromZipEntry = (
  targetId: InstallTargetId,
  zipEntryName: string,
): number | undefined => {
  if (targetId === 'github-copilot') {
    return undefined
  }

  if (targetId === 'claude-code') {
    if (QUALIFIED_CLAUDE_ENTRY_PATTERN.test(zipEntryName)) {
      return PATH_ENCODING_VERSION
    }

    if (LEGACY_CLAUDE_ENTRY_PATTERN.test(zipEntryName)) {
      return undefined
    }

    return undefined
  }

  if (QUALIFIED_SKILL_ENTRY_PATTERN.test(zipEntryName)) {
    return PATH_ENCODING_VERSION
  }

  if (LEGACY_SKILL_ENTRY_PATTERN.test(zipEntryName)) {
    return undefined
  }

  return undefined
}

export const inferPathEncodingVersionFromZipEntries = (
  targetId: InstallTargetId,
  zipEntryNames: readonly string[],
): number | undefined => {
  let inferred: number | undefined

  for (const entryName of zipEntryNames) {
    if (entryName.endsWith('/')) {
      continue
    }

    const entryEncoding = inferPathEncodingVersionFromZipEntry(targetId, entryName)
    if (entryEncoding === PATH_ENCODING_VERSION) {
      return PATH_ENCODING_VERSION
    }

    inferred ??= entryEncoding
  }

  return inferred
}

export const isLegacySkillRelativePath = (relativePath: string): boolean => {
  return LEGACY_SKILL_ENTRY_PATTERN.test(relativePath)
}

export const isLegacyClaudeRelativePath = (relativePath: string): boolean => {
  return LEGACY_CLAUDE_ENTRY_PATTERN.test(relativePath)
}

export const isLegacyRelativePath = (relativePath: string): boolean => {
  return isLegacySkillRelativePath(relativePath) || isLegacyClaudeRelativePath(relativePath)
}
