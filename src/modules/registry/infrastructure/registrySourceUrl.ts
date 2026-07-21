
export const DEFAULT_REGISTRY_REF = 'v2.x'
export const DEFAULT_REGISTRY_SOURCE_URL = `https://registry-proxy.maiconfz.workers.dev/?ref=${DEFAULT_REGISTRY_REF}`
export const DEFAULT_REGISTRY_GITHUB_REPOSITORY_URL =
  `https://github.com/agents-repo/registry/tree/${DEFAULT_REGISTRY_REF}`
export const DEFAULT_REGISTRY_INDEX_PATH = 'packages/index.json'
export const DEFAULT_REGISTRY_MANIFEST_SEGMENT = 'versions/manifest.json'

const GITHUB_HOSTNAME = 'github.com'
const GITHUB_WWW_HOSTNAME = 'www.github.com'
const GITHUB_BRANCH_PATH_MARKERS = new Set(['blob', 'tree'])

const GITHUB_EXPLICIT_REF_PREFIX = 'refs'
const GITHUB_EXPLICIT_REF_TYPES = new Set(['heads', 'tags'])

const getGitHubRefFromSegments = (segments: string[]): string => {
  if (segments.length < 4 || !GITHUB_BRANCH_PATH_MARKERS.has(segments[2])) {
    return DEFAULT_REGISTRY_REF
  }

  const refSegments = segments.slice(3).filter((segment) => segment.length > 0)

  if (refSegments.length === 0) {
    return DEFAULT_REGISTRY_REF
  }

  if (
    refSegments.length >= 3 &&
    refSegments[0] === GITHUB_EXPLICIT_REF_PREFIX &&
    GITHUB_EXPLICIT_REF_TYPES.has(refSegments[1])
  ) {
    const explicitRef = refSegments.slice(2).join('/').trim()
    return explicitRef.length > 0 ? explicitRef : DEFAULT_REGISTRY_REF
  }

  return refSegments[0]
}

const stripGitRepositorySuffix = (value: string): string => {
  return value.replace(/\.git$/i, '')
}

export const trimTrailingSlashes = (value: string): string => {
  let output = value

  while (output.endsWith('/')) {
    output = output.slice(0, -1)
  }

  return output
}

const encodePathSegment = (value: string): string => encodeURIComponent(value.trim())

export const trimLeadingSlashes = (value: string): string => {
  let output = value

  while (output.startsWith('/')) {
    output = output.slice(1)
  }

  return output
}

export const normalizeRegistryBaseUrl = (value: string): string => {
  const normalized = trimTrailingSlashes(value.trim())

  try {
    const parsedUrl = new URL(normalized)
    const segments = parsedUrl.pathname.split('/').filter((segment) => segment.length > 0)

    if (
      (parsedUrl.hostname !== GITHUB_HOSTNAME && parsedUrl.hostname !== GITHUB_WWW_HOSTNAME) ||
      segments.length < 2
    ) {
      return normalized
    }

    const owner = segments[0]
    const repository = stripGitRepositorySuffix(segments[1])
    const branch = getGitHubRefFromSegments(segments)

    return `https://raw.githubusercontent.com/${owner}/${repository}/${branch}`
  } catch {
    return normalized
  }
}

const RAW_GITHUB_HOSTNAME = 'raw.githubusercontent.com'

export interface RegistrySourceCacheIdentity {
  lookupKey: string
  indexPath: string
  sourceRef: string | null
}

export const getRegistryIndexCacheLookupKey = (indexUrl: string, indexPath: string): string | null => {
  try {
    const parsed = new URL(indexUrl)
    const normalizedIndexPath = `/${trimLeadingSlashes(indexPath)}`

    if (!parsed.pathname.endsWith(normalizedIndexPath)) {
      return null
    }

    const prefix = parsed.pathname.slice(0, -normalizedIndexPath.length)
    const prefixSegments = prefix.split('/').filter(Boolean)

    if (parsed.hostname === RAW_GITHUB_HOSTNAME && prefixSegments.length >= 3) {
      prefixSegments[prefixSegments.length - 1] = '{ref}'

      return `${parsed.origin}/${prefixSegments.join('/')}${normalizedIndexPath}`
    }

    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return null
  }
}

export const getRegistrySourceCacheIdentity = (
  baseUrlInput: string,
  indexPath: string,
): RegistrySourceCacheIdentity | null => {
  const indexUrl = buildRegistryIndexUrl(normalizeRegistryBaseUrl(baseUrlInput), indexPath)
  const lookupKey = getRegistryIndexCacheLookupKey(indexUrl, indexPath)

  if (!lookupKey) {
    return null
  }

  return { lookupKey, indexPath, sourceRef: null }
}

export const getRegistryBaseUrlFromIndexUrl = (indexUrl: string, indexPath: string): string => {
  try {
    const parsed = new URL(indexUrl)
    const normalizedIndexPath = `/${trimLeadingSlashes(indexPath)}`

    if (parsed.pathname.endsWith(normalizedIndexPath)) {
      parsed.pathname = parsed.pathname.slice(0, -normalizedIndexPath.length) || '/'
    }

    return trimTrailingSlashes(parsed.toString())
  } catch {
    return ''
  }
}

export const buildRegistryIndexUrl = (baseUrl: string, indexPath: string): string => {
  const normalizedBase = trimTrailingSlashes(baseUrl.trim())
  const normalizedPath = trimLeadingSlashes(indexPath)

  try {
    const parsedBaseUrl = new URL(normalizedBase)
    parsedBaseUrl.pathname = `${trimTrailingSlashes(parsedBaseUrl.pathname)}/${normalizedPath}`
    return parsedBaseUrl.toString()
  } catch {
    // Keep non-URL-compatible values working for testability and loose input handling.
  }

  return `${normalizedBase}/${normalizedPath}`
}

export const buildRegistryManifestPath = (namespace: string, packageId: string): string => {
  return [
    'packages',
    encodePathSegment(namespace),
    encodePathSegment(packageId),
    DEFAULT_REGISTRY_MANIFEST_SEGMENT,
  ].join('/')
}

export const buildRegistryManifestUrl = (
  baseUrl: string,
  namespace: string,
  packageId: string,
): string => buildRegistryIndexUrl(baseUrl, buildRegistryManifestPath(namespace, packageId))

export const buildRegistryArtifactPath = (
  namespace: string,
  packageId: string,
  version: string,
  targetId: string,
): string => {
  const encodedVersion = encodePathSegment(version)
  const encodedTargetId = encodePathSegment(targetId)

  return [
    'packages',
    encodePathSegment(namespace),
    encodePathSegment(packageId),
    'versions',
    encodedVersion,
    `${encodedVersion}-${encodedTargetId}.zip`,
  ].join('/')
}

export const buildRegistryArtifactFilePath = (
  namespace: string,
  packageId: string,
  version: string,
  artifactFile: string,
): string => {
  const encodedVersion = encodePathSegment(version)

  return [
    'packages',
    encodePathSegment(namespace),
    encodePathSegment(packageId),
    'versions',
    encodedVersion,
    encodeURIComponent(artifactFile.trim()),
  ].join('/')
}

export const buildRegistryArtifactUrl = (
  baseUrl: string,
  namespace: string,
  packageId: string,
  version: string,
  targetId: string,
): string => buildRegistryIndexUrl(baseUrl, buildRegistryArtifactPath(namespace, packageId, version, targetId))

export const buildRegistryArtifactFileUrl = (
  baseUrl: string,
  namespace: string,
  packageId: string,
  version: string,
  artifactFile: string,
): string =>
  buildRegistryIndexUrl(baseUrl, buildRegistryArtifactFilePath(namespace, packageId, version, artifactFile))

const isGitHubHostname = (hostname: string): boolean => {
  return hostname === GITHUB_HOSTNAME || hostname === GITHUB_WWW_HOSTNAME
}

export const buildRegistryPackageBrowseUrl = (
  githubRepositoryUrl: string,
  namespace: string,
  packageId: string,
): string | null => {
  const normalizedNamespace = namespace.trim()
  const normalizedPackageId = packageId.trim()

  if (normalizedNamespace.length === 0 || normalizedPackageId.length === 0) {
    return null
  }

  try {
    const parsedUrl = new URL(trimTrailingSlashes(githubRepositoryUrl.trim()))
    const segments = parsedUrl.pathname.split('/').filter((segment) => segment.length > 0)

    if (!isGitHubHostname(parsedUrl.hostname) || segments.length < 2) {
      return null
    }

    const owner = segments[0]
    const repository = stripGitRepositorySuffix(segments[1])
    const branch = getGitHubRefFromSegments(segments)

    return `https://github.com/${owner}/${repository}/tree/${branch}/packages/${encodePathSegment(normalizedNamespace)}/${encodePathSegment(normalizedPackageId)}`
  } catch {
    return null
  }
}
