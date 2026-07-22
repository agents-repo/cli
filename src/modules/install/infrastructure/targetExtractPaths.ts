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
