import AdmZip from 'adm-zip'
import matter from 'gray-matter'

import type { InstallTargetId } from '../../registry/domain/package.js'

const ZIP_MAX_ENTRY_NAME_LENGTH = 4096
const ZIP_UNIX_MODE_MASK = 0xffff
const ZIP_UNIX_TYPE_MASK = 0xf000
const ZIP_SYMLINK_TYPE = 0xa000

const DEPLOYMENT_ZIP_ENTRY_PATTERN = /^agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.agent\.md$/
const CLAUDE_AGENT_ENTRY_PATTERN = /^\.claude\/agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const SKILL_ENTRY_PATTERN =
  /^(?:\.cursor\/skills|\.agents\/skills)\/[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md$/
const DEPLOYMENT_ALLOWED_EXTENSION = '.agent.md'

export interface ZipValidationIssue {
  readonly code: string
  readonly message: string
  readonly severity: 'error'
}

const err = (code: string, message: string): ZipValidationIssue => ({
  code,
  message,
  severity: 'error',
})

const parseFrontmatter = (content: string): Record<string, string> => {
  try {
    const parsed = matter(content)
    const data: unknown = parsed.data
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return {}
    }

    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        result[key] = value
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        result[key] = String(value)
      }
    }
    return result
  } catch {
    return {}
  }
}

const parseFrontmatterData = (content: string): Record<string, unknown> => {
  try {
    const parsed = matter(content)
    const data: unknown = parsed.data
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

const hasTraversalPattern = (name: string): boolean => {
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

const validateEntryPath = (name: string, issues: ZipValidationIssue[]): boolean => {
  if (name.length === 0 || name.length > ZIP_MAX_ENTRY_NAME_LENGTH) {
    issues.push(err('ERR_ZIP_MALFORMED_ENTRY', `Malformed ZIP entry name length: "${name}"`))
    return false
  }

  if (hasTraversalPattern(name)) {
    issues.push(err('ERR_ZIP_TRAVERSAL', `Path traversal detected in ZIP entry: "${name}"`))
    return false
  }

  return true
}

const hasDeploymentAllowedExtension = (name: string): boolean => {
  return name.endsWith(DEPLOYMENT_ALLOWED_EXTENSION)
}

const validateDisallowedPayload = (name: string, issues: ZipValidationIssue[]): boolean => {
  const lowerName = name.toLowerCase()

  if (lowerName.startsWith('agents/') && !hasDeploymentAllowedExtension(name)) {
    issues.push(
      err(
        'ERR_ZIP_DISALLOWED_PAYLOAD',
        `Disallowed file type in deployment ZIP: "${name}" — entries under agents/ must end with ${DEPLOYMENT_ALLOWED_EXTENSION}`,
      ),
    )
    return false
  }

  if (
    (lowerName.startsWith('.cursor/skills/') || lowerName.startsWith('.agents/skills/')) &&
    !name.endsWith('/SKILL.md')
  ) {
    issues.push(
      err(
        'ERR_ZIP_DISALLOWED_PAYLOAD',
        `Disallowed file type in skill ZIP: "${name}" — entries under skill directories must end with /SKILL.md`,
      ),
    )
    return false
  }

  if (lowerName.startsWith('.claude/agents/') && !name.endsWith('.md')) {
    issues.push(
      err(
        'ERR_ZIP_DISALLOWED_PAYLOAD',
        `Disallowed file type in Claude target ZIP: "${name}" — entries under .claude/agents/ must end with .md`,
      ),
    )
    return false
  }

  return true
}

const validateNotSymlink = (
  entry: AdmZip.IZipEntry,
  name: string,
  issues: ZipValidationIssue[],
): boolean => {
  const unixMode = (entry.attr >>> 16) & ZIP_UNIX_MODE_MASK
  if (unixMode !== 0 && (unixMode & ZIP_UNIX_TYPE_MASK) === ZIP_SYMLINK_TYPE) {
    issues.push(err('ERR_ZIP_SYMLINK', `Symlink entry detected in ZIP: "${name}"`))
    return false
  }

  return true
}

const trackEntryCollisions = (
  name: string,
  issues: ZipValidationIssue[],
  seenExact: Set<string>,
  seenLower: Map<string, string>,
): void => {
  if (seenExact.has(name)) {
    issues.push(err('ERR_ZIP_COLLISION', `Duplicate ZIP entry: "${name}"`))
  } else {
    seenExact.add(name)
  }

  const lower = name.toLowerCase()
  const firstSeen = seenLower.get(lower)
  if (firstSeen !== undefined && firstSeen !== name) {
    issues.push(
      err(
        'ERR_ZIP_COLLISION',
        `Case-collision ZIP entry: "${name}" collides with "${firstSeen}"`,
      ),
    )
    return
  }

  if (firstSeen === undefined) {
    seenLower.set(lower, name)
  }
}

const validateFrontmatterVersion = (
  entry: AdmZip.IZipEntry,
  name: string,
  expectedVersion: string,
  issues: ZipValidationIssue[],
  scope: 'deployment' | 'source',
): void => {
  try {
    const content = entry.getData().toString('utf-8')
    const frontmatter = parseFrontmatter(content)
    if (frontmatter.version === expectedVersion) {
      return
    }

    const frontmatterVersion = Object.hasOwn(frontmatter, 'version')
      ? frontmatter.version
      : undefined
    const frontmatterVersionDisplay =
      frontmatterVersion === undefined ? '(missing)' : JSON.stringify(frontmatterVersion)

    const prefix = scope === 'deployment' ? 'Deployment' : 'Source'
    issues.push(
      err(
        'ERR_FRONTMATTER_VERSION_MISMATCH',
        `${prefix} ZIP entry "${name}": frontmatter version ${frontmatterVersionDisplay} must be "${expectedVersion}"`,
      ),
    )
  } catch {
    const prefix = scope === 'deployment' ? 'deployment' : 'source'
    issues.push(
      err('ERR_ZIP_MALFORMED_ENTRY', `Cannot read content of ${prefix} ZIP entry: "${name}"`),
    )
  }
}

const validateDeploymentEntry = (
  entry: AdmZip.IZipEntry,
  name: string,
  expectedVersion: string,
  issues: ZipValidationIssue[],
): void => {
  if (!DEPLOYMENT_ZIP_ENTRY_PATTERN.test(name)) {
    issues.push(
      err(
        'ERR_ZIP_UNEXPECTED_ENTRY',
        `Unexpected entry in deployment ZIP: "${name}" — only agents/<id>.agent.md is allowed`,
      ),
    )
    return
  }

  validateFrontmatterVersion(entry, name, expectedVersion, issues, 'deployment')
}

const validateSkillEntry = (
  entry: AdmZip.IZipEntry,
  name: string,
  issues: ZipValidationIssue[],
): void => {
  if (!SKILL_ENTRY_PATTERN.test(name)) {
    issues.push(
      err('ERR_ZIP_UNEXPECTED_ENTRY', `Unexpected entry in skill target ZIP: "${name}"`),
    )
    return
  }

  try {
    const content = entry.getData().toString('utf-8')
    const frontmatter = parseFrontmatterData(content)
    if (typeof frontmatter.name !== 'string' || frontmatter.name.trim().length === 0) {
      issues.push(
        err('ERR_ZIP_MALFORMED_ENTRY', `Skill ZIP entry "${name}" must include frontmatter name`),
      )
    }
    if (typeof frontmatter.description !== 'string' || frontmatter.description.trim().length === 0) {
      issues.push(
        err(
          'ERR_ZIP_MALFORMED_ENTRY',
          `Skill ZIP entry "${name}" must include frontmatter description`,
        ),
      )
    }
  } catch {
    issues.push(err('ERR_ZIP_MALFORMED_ENTRY', `Cannot read content of skill ZIP entry: "${name}"`))
  }
}

const validateClaudeEntry = (
  entry: AdmZip.IZipEntry,
  name: string,
  expectedVersion: string,
  issues: ZipValidationIssue[],
): void => {
  if (!CLAUDE_AGENT_ENTRY_PATTERN.test(name)) {
    issues.push(
      err('ERR_ZIP_UNEXPECTED_ENTRY', `Unexpected entry in Claude target ZIP: "${name}"`),
    )
    return
  }

  validateFrontmatterVersion(entry, name, expectedVersion, issues, 'deployment')
}

const scanSnapshotZipBuffer = (
  zipBytes: Buffer,
  opts: { type: 'deployment' | 'source'; expectedVersion: string },
): ZipValidationIssue[] => {
  const issues: ZipValidationIssue[] = []

  let zip: AdmZip
  try {
    zip = new AdmZip(zipBytes)
  } catch (error) {
    return [err('ERR_ZIP_MALFORMED_ENTRY', `Cannot open ZIP — ${String(error)}`)]
  }

  const seenExact = new Set<string>()
  const seenLower = new Map<string, string>()

  for (const entry of zip.getEntries()) {
    const name = entry.entryName

    if (name.endsWith('/')) {
      continue
    }

    if (!validateEntryPath(name, issues)) {
      continue
    }

    if (!validateNotSymlink(entry, name, issues)) {
      continue
    }

    trackEntryCollisions(name, issues, seenExact, seenLower)

    if (!validateDisallowedPayload(name, issues)) {
      continue
    }

    if (opts.type === 'deployment') {
      validateDeploymentEntry(entry, name, opts.expectedVersion, issues)
    }
  }

  return issues
}

export const scanTargetArtifactZipBuffer = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  expectedVersion: string,
): ZipValidationIssue[] => {
  if (targetId === 'github-copilot') {
    return scanSnapshotZipBuffer(zipBytes, { type: 'deployment', expectedVersion })
  }

  const issues: ZipValidationIssue[] = []
  let zip: AdmZip
  try {
    zip = new AdmZip(zipBytes)
  } catch (error) {
    return [err('ERR_ZIP_MALFORMED_ENTRY', `Cannot open ZIP — ${String(error)}`)]
  }

  const seenExact = new Set<string>()
  const seenLower = new Map<string, string>()

  for (const entry of zip.getEntries()) {
    const name = entry.entryName
    if (name.endsWith('/')) {
      continue
    }

    if (!validateEntryPath(name, issues)) {
      continue
    }

    if (!validateNotSymlink(entry, name, issues)) {
      continue
    }

    trackEntryCollisions(name, issues, seenExact, seenLower)

    if (!validateDisallowedPayload(name, issues)) {
      continue
    }

    if (targetId === 'claude-code') {
      validateClaudeEntry(entry, name, expectedVersion, issues)
      continue
    }

    validateSkillEntry(entry, name, issues)
  }

  return issues
}
