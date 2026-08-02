import AdmZip from 'adm-zip'

import { ConfigValidationError } from '../../config/domain/configErrors.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import type { InstallSelection } from '../domain/installSelection.js'
import { scanTargetArtifactZipBuffer } from '../infrastructure/zipSecurityScanner.js'
import { InstallZipSecurityError } from '../domain/installErrors.js'

const ITEM_ID_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*'

const githubCopilotAgentFile = new RegExp(`^agents/(${ITEM_ID_PATTERN})\\.agent\\.md$`)
const githubCopilotAgentMeta = new RegExp(`^agents/(${ITEM_ID_PATTERN})\\.metadata\\.json$`)

const cursorSkillPath = new RegExp(`^\\.cursor/skills/(${ITEM_ID_PATTERN})(?:/|$)`)
const claudeAgentFile = new RegExp(`^\\.claude/agents/(${ITEM_ID_PATTERN})\\.md$`)
const claudeAgentMeta = new RegExp(`^\\.claude/agents/(${ITEM_ID_PATTERN})\\.metadata\\.json$`)
const codexSkillPath = new RegExp(`^\\.agents/skills/(${ITEM_ID_PATTERN})(?:/|$)`)

const normalizeZipEntryName = (entryName: string): string => entryName.replace(/^\.\//, '')

const firstCaptureGroup = (pattern: RegExp, value: string): string | null => {
  const match = pattern.exec(value)
  return match?.[1] ?? null
}

const firstMatchingCapture = (value: string, patterns: readonly RegExp[]): string | null => {
  for (const pattern of patterns) {
    const captured = firstCaptureGroup(pattern, value)
    if (captured !== null) {
      return captured
    }
  }
  return null
}

export const parseItemIdFromZipEntry = (
  entryName: string,
  targetId: InstallTargetId,
): string | null => {
  const name = normalizeZipEntryName(entryName)

  switch (targetId) {
    case 'github-copilot':
      return firstMatchingCapture(name, [githubCopilotAgentFile, githubCopilotAgentMeta])
    case 'cursor':
      return firstCaptureGroup(cursorSkillPath, name)
    case 'claude-code':
      return firstMatchingCapture(name, [claudeAgentFile, claudeAgentMeta])
    case 'openai-codex':
      return firstCaptureGroup(codexSkillPath, name)
    default:
      return null
  }
}

export const listAgentAndFlowIdsFromZipEntryNames = (
  entryNames: readonly string[],
  targetId: InstallTargetId,
): ReadonlySet<string> => {
  const ids = new Set<string>()
  for (const entryName of entryNames) {
    const id = parseItemIdFromZipEntry(entryName, targetId)
    if (id !== null) {
      ids.add(id)
    }
  }
  return ids
}

export const zipEntryBelongsToSelection = (
  entryName: string,
  targetId: InstallTargetId,
  selectionId: string,
): boolean => {
  const itemId = parseItemIdFromZipEntry(entryName, targetId)
  return itemId !== null && itemId === selectionId
}

const listZipFileEntryNames = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
): string[] => {
  const issues = scanTargetArtifactZipBuffer(zipBytes, targetId, version)
  const blocking = issues.find((issue) => issue.severity === 'error')
  if (blocking !== undefined) {
    throw new InstallZipSecurityError(blocking.code, blocking.message)
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(zipBytes)
  } catch (error) {
    throw new InstallZipSecurityError(
      'ERR_ZIP_MALFORMED_ENTRY',
      `Cannot open ZIP artifact: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const names: string[] = []
  for (const entry of zip.getEntries()) {
    if (entry.entryName.endsWith('/')) {
      continue
    }
    names.push(entry.entryName)
  }
  return names
}

export const assertSelectionInArtifactZip = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  packageId: string,
  selection: InstallSelection,
): void => {
  const entryNames = listZipFileEntryNames(zipBytes, targetId, version)
  const ids = listAgentAndFlowIdsFromZipEntryNames(entryNames, targetId)

  if (!ids.has(selection.id)) {
    throw new ConfigValidationError(
      `Selector "${selection.id}" is not an agent or flow id in ${packageId}`,
      'selector_not_found',
    )
  }
}
