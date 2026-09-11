import type { InstallTargetId } from '../../registry/domain/package.js'

/** Registry manifest `artifacts[].pathEncoding` value for qualified install-leaf ZIPs. */
export const PATH_ENCODING_VERSION = 1

const ID_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'

const LEGACY_SKILL_ENTRY_PATTERN = new RegExp(
  `^(?:\\.cursor/skills|\\.agents/skills)/${ID_SEGMENT}/SKILL\\.md$`,
)

const QUALIFIED_SKILL_ENTRY_PATTERN = new RegExp(
  `^(?:\\.cursor/skills|\\.agents/skills)/${ID_SEGMENT}/${ID_SEGMENT}/${ID_SEGMENT}/SKILL\\.md$`,
)

const QUALIFIED_CLAUDE_ENTRY_PATTERN = new RegExp(
  `^\\.claude/agents/${ID_SEGMENT}/${ID_SEGMENT}/${ID_SEGMENT}\\.md$`,
)

const LEGACY_CLAUDE_ENTRY_PATTERN = new RegExp(
  `^\\.claude/agents/${ID_SEGMENT}\\.md$`,
)

export const computeInstallLeaf = (
  namespace: string,
  packageId: string,
  sourceId: string,
): string => `${namespace}-${packageId}-${sourceId}`

export const resolvePathEncodingVersionFromManifest = (
  pathEncoding: number | undefined,
): number | undefined => {
  if (pathEncoding === PATH_ENCODING_VERSION) {
    return PATH_ENCODING_VERSION
  }

  return undefined
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

    if (inferred === undefined) {
      inferred = entryEncoding
    }
  }

  return inferred
}

export const isLegacySkillRelativePath = (relativePath: string): boolean => {
  return LEGACY_SKILL_ENTRY_PATTERN.test(relativePath)
}
