import semver from 'semver'

import { DEFAULT_REGISTRY_REF } from './registrySourceUrl.js'

const MAJOR_VERSION_LINE_ALIAS_PATTERN = /^v?\d+\.x$/i

const GITHUB_HOSTNAME = 'github.com'
const GITHUB_WWW_HOSTNAME = 'www.github.com'
const RAW_GITHUB_HOSTNAME = 'raw.githubusercontent.com'
const GITHUB_BRANCH_PATH_MARKERS = new Set(['blob', 'tree'])
const GITHUB_EXPLICIT_REF_PREFIX = 'refs'
const GITHUB_EXPLICIT_REF_TYPES = new Set(['heads', 'tags'])

export interface GitHubRepositoryIdentity {
  readonly owner: string
  readonly repo: string
}

export interface MajorVersionLineAlias {
  readonly alias: string
  readonly major: number
}

const stripGitRepositorySuffix = (value: string): string => {
  return value.replace(/\.git$/i, '')
}

const isGitHubHostname = (hostname: string): boolean => {
  return hostname === GITHUB_HOSTNAME || hostname === GITHUB_WWW_HOSTNAME
}

const getGitHubRefFromSegments = (segments: string[]): string | null => {
  if (segments.length < 4 || !GITHUB_BRANCH_PATH_MARKERS.has(segments[2])) {
    return null
  }

  const refSegments = segments.slice(3).filter((segment) => segment.length > 0)

  if (refSegments.length === 0) {
    return null
  }

  if (
    refSegments.length >= 3 &&
    refSegments[0] === GITHUB_EXPLICIT_REF_PREFIX &&
    GITHUB_EXPLICIT_REF_TYPES.has(refSegments[1])
  ) {
    const explicitRef = refSegments.slice(2).join('/').trim()
    return explicitRef.length > 0 ? explicitRef : null
  }

  return refSegments[0]
}

export const parseMajorVersionLineAlias = (ref: string): MajorVersionLineAlias | null => {
  const normalizedRef = ref.trim()

  if (!MAJOR_VERSION_LINE_ALIAS_PATTERN.test(normalizedRef)) {
    return null
  }

  const majorMatch = /^v?(\d+)\.x$/i.exec(normalizedRef)

  if (!majorMatch) {
    return null
  }

  return {
    alias: normalizedRef,
    major: Number.parseInt(majorMatch[1], 10),
  }
}

export const extractRegistryRef = (sourceUrl: string): string | null => {
  const normalized = sourceUrl.trim()

  if (normalized.length === 0) {
    return null
  }

  try {
    const parsedUrl = new URL(normalized)
    const queryRef = parsedUrl.searchParams.get('ref')?.trim()

    if (queryRef) {
      return queryRef
    }

    const segments = parsedUrl.pathname.split('/').filter((segment) => segment.length > 0)

    if (parsedUrl.hostname === RAW_GITHUB_HOSTNAME && segments.length >= 3) {
      return segments[2]
    }

    if (isGitHubHostname(parsedUrl.hostname) && segments.length >= 2) {
      const refFromTree = getGitHubRefFromSegments(segments)

      if (refFromTree !== null) {
        return refFromTree
      }

      if (segments.length === 2) {
        return DEFAULT_REGISTRY_REF
      }
    }
  } catch {
    return null
  }

  return null
}

export const extractMajorVersionLineAliasFromSourceUrl = (sourceUrl: string): MajorVersionLineAlias | null => {
  const ref = extractRegistryRef(sourceUrl)

  if (!ref) {
    return null
  }

  return parseMajorVersionLineAlias(ref)
}

const getMajorVersionFromConcreteRef = (ref: string): number | null => {
  const version = semver.valid(semver.coerce(ref, { loose: true }))

  if (!version) {
    return null
  }

  return semver.major(version)
}

export const refsAreCompatibleForCatalogCacheFallback = (
  sourceRef: string | null,
  envelopeRef: string | null,
): boolean => {
  if (!sourceRef && !envelopeRef) {
    return true
  }

  if (!sourceRef || !envelopeRef) {
    return false
  }

  if (sourceRef === envelopeRef) {
    return true
  }

  const sourceAlias = parseMajorVersionLineAlias(sourceRef)

  if (!sourceAlias) {
    return false
  }

  const envelopeAlias = parseMajorVersionLineAlias(envelopeRef)

  if (envelopeAlias) {
    return envelopeAlias.major === sourceAlias.major
  }

  const envelopeMajor = getMajorVersionFromConcreteRef(envelopeRef)

  return envelopeMajor !== null && envelopeMajor === sourceAlias.major
}

const substituteRawGitHubPathRef = (segments: string[], nextRef: string): string => {
  const nextRefSegments = nextRef.split('/').filter((segment) => segment.length > 0)
  const nextSegments = [...segments.slice(0, 2), ...nextRefSegments, ...segments.slice(3)]

  return `/${nextSegments.join('/')}`
}

const substituteGitHubTreePathRef = (segments: string[], nextRef: string): string | null => {
  if (segments.length < 4 || !GITHUB_BRANCH_PATH_MARKERS.has(segments[2])) {
    return null
  }

  const refSegments = segments.slice(3).filter((segment) => segment.length > 0)

  if (
    refSegments.length >= 3 &&
    refSegments[0] === GITHUB_EXPLICIT_REF_PREFIX &&
    GITHUB_EXPLICIT_REF_TYPES.has(refSegments[1])
  ) {
    const nextSegments = [...segments.slice(0, 3), GITHUB_EXPLICIT_REF_PREFIX, refSegments[1], ...nextRef.split('/')]
    return `/${nextSegments.join('/')}`
  }

  const nextSegments = [...segments.slice(0, 3), nextRef, ...refSegments.slice(1)]
  return `/${nextSegments.join('/')}`
}

export const substituteRegistryRef = (sourceUrl: string, nextRef: string): string => {
  const normalized = sourceUrl.trim()

  try {
    const parsedUrl = new URL(normalized)

    if (parsedUrl.searchParams.has('ref')) {
      parsedUrl.searchParams.set('ref', nextRef)
      return parsedUrl.toString()
    }

    const segments = parsedUrl.pathname.split('/').filter((segment) => segment.length > 0)

    if (isGitHubHostname(parsedUrl.hostname) && segments.length === 2) {
      const owner = segments[0]
      const repository = stripGitRepositorySuffix(segments[1])
      parsedUrl.pathname = `/${owner}/${repository}/tree/${nextRef}`
      return parsedUrl.toString()
    }

    if (parsedUrl.hostname === RAW_GITHUB_HOSTNAME && segments.length >= 3) {
      parsedUrl.pathname = substituteRawGitHubPathRef(segments, nextRef)
      return parsedUrl.toString()
    }

    if (isGitHubHostname(parsedUrl.hostname)) {
      const nextPathname = substituteGitHubTreePathRef(segments, nextRef)

      if (nextPathname) {
        parsedUrl.pathname = nextPathname
        return parsedUrl.toString()
      }
    }
  } catch {
    return normalized
  }

  return normalized
}

export const parseGitHubRepositoryIdentity = (sourceUrl: string): GitHubRepositoryIdentity | null => {
  const normalized = sourceUrl.trim()

  if (normalized.length === 0) {
    return null
  }

  try {
    const parsedUrl = new URL(normalized)
    const segments = parsedUrl.pathname.split('/').filter((segment) => segment.length > 0)

    if (!isGitHubHostname(parsedUrl.hostname) || segments.length < 2) {
      return null
    }

    return {
      owner: segments[0],
      repo: stripGitRepositorySuffix(segments[1]),
    }
  } catch {
    return null
  }
}

export const inferRegistryRepositoryIdentity = (
  sourceUrl: string,
  fallbackRepositoryUrl: string,
): GitHubRepositoryIdentity | null => {
  return parseGitHubRepositoryIdentity(sourceUrl) ?? parseGitHubRepositoryIdentity(fallbackRepositoryUrl)
}
