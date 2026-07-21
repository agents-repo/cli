import semver from 'semver'

import { RegistryFetchError, RegistryRefResolutionError } from '../domain/errors.js'
import { inferRegistryRepositoryIdentity } from './registryMajorVersionRef.js'

const TAG_LIST_CACHE_TTL_MS = 60 * 60 * 1000

interface GitHubTagPayload {
  readonly name: string
}

interface TagListCacheEnvelope {
  readonly cacheVersion: number
  readonly cachedAt: number
  readonly repositoryKey: string
  readonly tagNames: string[]
}

const TAG_LIST_CACHE_VERSION = 3

const GITHUB_HOSTNAMES = new Set(['github.com', 'www.github.com', 'raw.githubusercontent.com'])

const GITHUB_TAGS_API_PATH_PATTERN = /^\/repos\/([^/]+)\/([^/]+)\/tags\/?$/

const inFlightTagFetchesByTagsUrl = new Map<
  string,
  { promise: Promise<string[]>; bypassCache: boolean }
>()

const inFlightTagFetchesByRepositoryKey = new Map<string, Set<Promise<string[]>>>()

const tagListCacheByRepositoryKey = new Map<string, TagListCacheEnvelope>()

const registerInFlightTagFetchForRepository = (
  repositoryKey: string,
  promise: Promise<string[]>,
): void => {
  const peers = inFlightTagFetchesByRepositoryKey.get(repositoryKey) ?? new Set<Promise<string[]>>()
  peers.add(promise)
  inFlightTagFetchesByRepositoryKey.set(repositoryKey, peers)

  void promise
    .catch(() => undefined)
    .finally(() => {
      peers.delete(promise)

      if (peers.size === 0) {
        inFlightTagFetchesByRepositoryKey.delete(repositoryKey)
      }
    })
}

const recoverTagNamesFromPeerFetches = async (
  repositoryKey: string,
  failedPromise: Promise<string[]>,
): Promise<string[] | null> => {
  const peers = inFlightTagFetchesByRepositoryKey.get(repositoryKey)

  if (!peers) {
    return null
  }

  for (const peer of peers) {
    if (peer === failedPromise) {
      continue
    }

    try {
      return await peer
    } catch {
      continue
    }
  }

  return null
}

export const buildRepositoryKey = (owner: string, repo: string): string => `${owner}/${repo}`

const parseRepositoryKeyFromTagsUrl = (tagsUrl: string): string | null => {
  try {
    const parsedUrl = new URL(tagsUrl)

    if (parsedUrl.hostname !== 'api.github.com') {
      return null
    }

    const match = GITHUB_TAGS_API_PATH_PATTERN.exec(parsedUrl.pathname)

    if (!match) {
      return null
    }

    return buildRepositoryKey(match[1], match[2])
  } catch {
    return null
  }
}

const resolveRepositoryKey = (
  tagsUrl: string,
  repositoryKey: string | undefined,
): string | null => {
  if (repositoryKey && repositoryKey.trim().length > 0) {
    return repositoryKey
  }

  return parseRepositoryKeyFromTagsUrl(tagsUrl)
}

const readTagListCache = (repositoryKey: string): string[] | null => {
  const envelope = tagListCacheByRepositoryKey.get(repositoryKey)

  if (!envelope) {
    return null
  }

  if (
    envelope.cacheVersion !== TAG_LIST_CACHE_VERSION ||
    envelope.repositoryKey !== repositoryKey ||
    !Array.isArray(envelope.tagNames)
  ) {
    return null
  }

  if (Date.now() - envelope.cachedAt > TAG_LIST_CACHE_TTL_MS) {
    tagListCacheByRepositoryKey.delete(repositoryKey)
    return null
  }

  return envelope.tagNames
}

const writeTagListCache = (repositoryKey: string, tagNames: string[]): void => {
  tagListCacheByRepositoryKey.set(repositoryKey, {
    cacheVersion: TAG_LIST_CACHE_VERSION,
    cachedAt: Date.now(),
    repositoryKey,
    tagNames,
  })
}

export const clearRegistryTagListCache = (): void => {
  inFlightTagFetchesByTagsUrl.clear()
  inFlightTagFetchesByRepositoryKey.clear()
  tagListCacheByRepositoryKey.clear()
}

export const buildRegistryTagsUrl = (sourceUrl: string, fallbackRepositoryUrl: string): string => {
  const normalizedSourceUrl = sourceUrl.trim()

  if (normalizedSourceUrl.length > 0) {
    try {
      const parsedSourceUrl = new URL(normalizedSourceUrl)

      if (!GITHUB_HOSTNAMES.has(parsedSourceUrl.hostname)) {
        const basePath = parsedSourceUrl.pathname.replace(/\/$/, '')
        parsedSourceUrl.pathname = `${basePath}/tags`
        return parsedSourceUrl.toString()
      }
    } catch {
      // Fall through to GitHub API URL derivation.
    }
  }

  const repositoryIdentity = inferRegistryRepositoryIdentity(sourceUrl, fallbackRepositoryUrl)

  if (!repositoryIdentity) {
    throw new RegistryRefResolutionError('Could not infer a GitHub repository for tag listing.')
  }

  return `https://api.github.com/repos/${repositoryIdentity.owner}/${repositoryIdentity.repo}/tags?per_page=100`
}

const isGitHubTagsApiUrl = (tagsUrl: string): boolean => {
  try {
    return new URL(tagsUrl).hostname === 'api.github.com'
  } catch {
    return false
  }
}

const parseLinkHeaderNextUrl = (linkHeader: string | null): string | null => {
  if (!linkHeader) {
    return null
  }

  const nextLink = linkHeader
    .split(',')
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith('rel="next"'))

  if (!nextLink) {
    return null
  }

  const match = /^<([^>]+)>/.exec(nextLink)
  return match?.[1] ?? null
}

const parseTagNamesPayload = (payload: GitHubTagPayload[]): string[] => {
  return payload.map((entry) => entry.name).filter((name) => name.trim().length > 0)
}

const fetchRegistryTagNamesPage = async (
  url: string,
  signal: AbortSignal | undefined,
): Promise<{ tagNames: string[]; nextUrl: string | null }> => {
  const headers: Record<string, string> = {}

  if (isGitHubTagsApiUrl(url)) {
    headers.Accept = 'application/vnd.github+json'
    headers['X-GitHub-Api-Version'] = '2022-11-28'
  }

  const response = await fetch(url, {
    signal,
    headers,
  })

  if (!response.ok) {
    throw new RegistryFetchError(
      `Registry tags request failed (${response.status} ${response.statusText})`,
      response.status,
    )
  }

  const payload = (await response.json()) as GitHubTagPayload[]

  return {
    tagNames: parseTagNamesPayload(payload),
    nextUrl: isGitHubTagsApiUrl(url) ? parseLinkHeaderNextUrl(response.headers.get('Link')) : null,
  }
}

const fetchRegistryRepositoryTagNamesFromNetwork = async (
  tagsUrl: string,
  repositoryKey: string,
  signal: AbortSignal | undefined,
): Promise<string[]> => {
  const tagNames: string[] = []
  let nextUrl: string | null = tagsUrl

  while (nextUrl) {
    const pageResult = await fetchRegistryTagNamesPage(nextUrl, signal)
    tagNames.push(...pageResult.tagNames)
    nextUrl = pageResult.nextUrl
  }

  writeTagListCache(repositoryKey, tagNames)

  return tagNames
}

const toAbortError = (signal: AbortSignal): Error => {
  const reason: unknown = signal.reason

  if (reason instanceof Error) {
    return reason
  }

  return new DOMException('Aborted', 'AbortError')
}

const attachCallerAbortSignal = <T>(
  sharedPromise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> => {
  if (!signal) {
    return sharedPromise
  }

  if (signal.aborted) {
    return Promise.reject(toAbortError(signal))
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(toAbortError(signal))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    sharedPromise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

export const fetchRegistryRepositoryTagNames = async (
  tagsUrl: string,
  options: { signal?: AbortSignal; bypassCache?: boolean; repositoryKey?: string } = {},
): Promise<string[]> => {
  const repositoryKey = resolveRepositoryKey(tagsUrl, options.repositoryKey)

  if (!repositoryKey) {
    throw new RegistryRefResolutionError(
      `Could not resolve a repository key for tag list caching (tags URL: ${tagsUrl}). ` +
        'Pass repositoryKey (owner/repo) when the tags URL is not a GitHub API /repos/{owner}/{repo}/tags endpoint.',
    )
  }

  if (!options.bypassCache) {
    const cachedTagNames = readTagListCache(repositoryKey)

    if (cachedTagNames) {
      return cachedTagNames
    }
  }

  const inFlightFetch = inFlightTagFetchesByTagsUrl.get(tagsUrl)

  if (inFlightFetch && (!options.bypassCache || inFlightFetch.bypassCache)) {
    return attachCallerAbortSignal(inFlightFetch.promise, options.signal)
  }

  const fetchPromise = ((): Promise<string[]> => {
    const promise = fetchRegistryRepositoryTagNamesFromNetwork(tagsUrl, repositoryKey, options.signal).catch(
      async (error: unknown) => {
        if (!options.bypassCache) {
          const cachedTagNames = readTagListCache(repositoryKey)

          if (cachedTagNames) {
            return cachedTagNames
          }

          const peerTagNames = await recoverTagNamesFromPeerFetches(repositoryKey, promise)

          if (peerTagNames) {
            return peerTagNames
          }
        }

        throw error instanceof Error ? error : new Error(String(error))
      },
    )

    registerInFlightTagFetchForRepository(repositoryKey, promise)

    const settledPromise = promise.finally(() => {
      const currentFetch = inFlightTagFetchesByTagsUrl.get(tagsUrl)

      if (currentFetch?.promise === settledPromise) {
        inFlightTagFetchesByTagsUrl.delete(tagsUrl)
      }
    })

    return settledPromise
  })()

  inFlightTagFetchesByTagsUrl.set(tagsUrl, {
    promise: fetchPromise,
    bypassCache: options.bypassCache === true,
  })

  return attachCallerAbortSignal(fetchPromise, options.signal)
}

export const fetchGitHubRepositoryTagNames = async (
  owner: string,
  repo: string,
  options: { signal?: AbortSignal; bypassCache?: boolean } = {},
): Promise<string[]> => {
  return fetchRegistryRepositoryTagNames(
    `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`,
    {
      ...options,
      repositoryKey: buildRepositoryKey(owner, repo),
    },
  )
}

export const pickLatestStableTagForMajorVersion = (
  tagNames: readonly string[],
  major: number,
): string | null => {
  const stableTags = tagNames
    .map((tag) => ({
      tag,
      version: semver.valid(semver.coerce(tag, { loose: true })),
    }))
    .filter((entry): entry is { tag: string; version: string } => {
      return entry.version !== null && semver.prerelease(entry.version) === null
    })

  const versions = stableTags.map((entry) => entry.version)
  const bestVersion = semver.maxSatisfying(versions, `${major}.x`)

  if (!bestVersion) {
    return null
  }

  return stableTags.find((entry) => entry.version === bestVersion)?.tag ?? null
}

export const resolveLatestStableTagForMajorVersion = async (
  owner: string,
  repo: string,
  major: number,
  options: {
    signal?: AbortSignal
    bypassCache?: boolean
    sourceUrl?: string
    fallbackRepositoryUrl?: string
  } = {},
): Promise<string> => {
  const repositoryKey = buildRepositoryKey(owner, repo)
  const tagsUrl =
    options.sourceUrl && options.fallbackRepositoryUrl
      ? buildRegistryTagsUrl(options.sourceUrl, options.fallbackRepositoryUrl)
      : `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`

  const tagNames = await fetchRegistryRepositoryTagNames(tagsUrl, {
    ...options,
    repositoryKey,
  })
  const resolvedTag = pickLatestStableTagForMajorVersion(tagNames, major)

  if (!resolvedTag) {
    throw new RegistryRefResolutionError(
      `No stable release tag found for major version line ${major}.x in ${owner}/${repo}`,
    )
  }

  return resolvedTag
}
