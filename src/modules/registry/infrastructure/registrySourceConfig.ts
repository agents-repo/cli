import {
  buildRegistryIndexUrl,
  DEFAULT_REGISTRY_GITHUB_REPOSITORY_URL,
  DEFAULT_REGISTRY_INDEX_PATH,
  DEFAULT_REGISTRY_REF,
  DEFAULT_REGISTRY_SOURCE_URL,
  normalizeRegistryBaseUrl,
} from './registrySourceUrl.js'
import {
  extractMajorVersionLineAliasFromSourceUrl,
  inferRegistryRepositoryIdentity,
  substituteRegistryRef,
  type MajorVersionLineAlias,
} from './registryMajorVersionRef.js'
import { resolveLatestStableTagForMajorVersion } from './registryTagResolver.js'

export interface RegistryConfig {
  readonly url: string
  readonly ref: string
}

export const DEFAULT_REGISTRY_CONFIG: RegistryConfig = {
  url: 'https://registry-proxy.maiconfz.workers.dev',
  ref: DEFAULT_REGISTRY_REF,
}

export interface RegistryRefResolution {
  readonly alias: string
  readonly resolvedRef: string
}

export interface RegistrySourceConfig {
  sourceUrl: string
  configuredBaseUrl: string
  baseUrl: string
  indexPath: string
  indexUrl: string
  configuredGithubRepositoryUrl: string
  baseUrlRefResolution: RegistryRefResolution | null
}

interface ResolveSourceUrlOptions {
  readonly signal?: AbortSignal
  readonly bypassTagCache?: boolean
}

export const buildSourceUrlFromRegistryConfig = (config: RegistryConfig): string => {
  const url = config.url.trim()
  const ref = config.ref.trim()

  if (ref.length === 0) {
    return url
  }

  try {
    const parsed = new URL(url)

    if (!parsed.searchParams.has('ref')) {
      parsed.searchParams.set('ref', ref)
      return parsed.toString()
    }

    return url
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}ref=${encodeURIComponent(ref)}`
  }
}

const buildRegistrySourceConfig = (input: {
  sourceUrl: string
  configuredBaseUrl: string
  baseUrl: string
  indexPath: string
  configuredGithubRepositoryUrl: string
  baseUrlRefResolution: RegistryRefResolution | null
}): RegistrySourceConfig => {
  return {
    ...input,
    indexUrl: buildRegistryIndexUrl(input.baseUrl, input.indexPath),
  }
}

export const getRegistrySourceConfig = (config: RegistryConfig = DEFAULT_REGISTRY_CONFIG): RegistrySourceConfig => {
  const sourceUrl = buildSourceUrlFromRegistryConfig(config)
  const configuredBaseUrl = sourceUrl
  const indexPath = DEFAULT_REGISTRY_INDEX_PATH
  const configuredGithubRepositoryUrl = DEFAULT_REGISTRY_GITHUB_REPOSITORY_URL
  const baseUrl = normalizeRegistryBaseUrl(configuredBaseUrl)

  return buildRegistrySourceConfig({
    sourceUrl,
    configuredBaseUrl,
    baseUrl,
    indexPath,
    configuredGithubRepositoryUrl,
    baseUrlRefResolution: null,
  })
}

const resolveSourceUrlWithAlias = async (
  sourceUrl: string,
  fallbackRepositoryUrl: string,
  alias: MajorVersionLineAlias,
  options: ResolveSourceUrlOptions,
): Promise<{ resolvedSourceUrl: string; resolution: RegistryRefResolution }> => {
  const repositoryIdentity = inferRegistryRepositoryIdentity(sourceUrl, fallbackRepositoryUrl)

  if (!repositoryIdentity) {
    throw new Error('Could not infer a GitHub repository for major-version line ref resolution.')
  }

  const resolvedRef = await resolveLatestStableTagForMajorVersion(
    repositoryIdentity.owner,
    repositoryIdentity.repo,
    alias.major,
    {
      signal: options.signal,
      bypassCache: options.bypassTagCache,
      sourceUrl,
      fallbackRepositoryUrl,
    },
  )

  return {
    resolvedSourceUrl: substituteRegistryRef(sourceUrl, resolvedRef),
    resolution: {
      alias: alias.alias,
      resolvedRef,
    },
  }
}

const resolveRegistryBaseSourceUrl = async (
  configuredSource: RegistrySourceConfig,
  options: ResolveSourceUrlOptions,
): Promise<{
  baseUrlInput: string
  baseUrlRefResolution: RegistryRefResolution | null
}> => {
  const baseUrlInput = configuredSource.configuredBaseUrl
  const alias = extractMajorVersionLineAliasFromSourceUrl(baseUrlInput)

  if (!alias) {
    return {
      baseUrlInput,
      baseUrlRefResolution: null,
    }
  }

  const resolved = await resolveSourceUrlWithAlias(
    baseUrlInput,
    configuredSource.configuredGithubRepositoryUrl,
    alias,
    options,
  )

  return {
    baseUrlInput: resolved.resolvedSourceUrl,
    baseUrlRefResolution: resolved.resolution,
  }
}

export const resolveRegistryFetchSourceConfig = async (
  config: RegistryConfig = DEFAULT_REGISTRY_CONFIG,
  options: ResolveSourceUrlOptions = {},
): Promise<RegistrySourceConfig> => {
  const configuredSource = getRegistrySourceConfig(config)
  const baseSourceResolution = await resolveRegistryBaseSourceUrl(configuredSource, options)
  const baseUrl = normalizeRegistryBaseUrl(baseSourceResolution.baseUrlInput)

  return buildRegistrySourceConfig({
    ...configuredSource,
    baseUrl,
    baseUrlRefResolution: baseSourceResolution.baseUrlRefResolution,
  })
}

// Re-export for tests that compare against webapp default source URL shape.
export { DEFAULT_REGISTRY_SOURCE_URL }
