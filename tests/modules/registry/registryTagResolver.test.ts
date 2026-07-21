import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildRegistryTagsUrl,
  clearRegistryTagListCache,
  fetchGitHubRepositoryTagNames,
  fetchRegistryRepositoryTagNames,
  pickLatestStableTagForMajorVersion,
} from '../../../src/modules/registry/infrastructure/registryTagResolver.js'

describe('registryTagResolver', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    clearRegistryTagListCache()
    vi.restoreAllMocks()
  })

  it('builds registry-proxy tags URL from proxy source base', () => {
    expect(
      buildRegistryTagsUrl(
        'https://registry-proxy.example.workers.dev?ref=1.x',
        'https://github.com/agents-repo/registry',
      ),
    ).toBe('https://registry-proxy.example.workers.dev/tags?ref=1.x')
  })

  it('preserves path prefixes when building registry-proxy tags URLs', () => {
    expect(
      buildRegistryTagsUrl(
        'https://registry-proxy.example.workers.dev/base?ref=1.x',
        'https://github.com/agents-repo/registry',
      ),
    ).toBe('https://registry-proxy.example.workers.dev/base/tags?ref=1.x')
  })

  it('picks the latest stable tag for a major version line', () => {
    const tagNames = ['v1.0.0', 'v1.1.0', 'v1.2.0', 'v1.2.0-rc.1', 'v1.10.0', 'v2.0.0']

    expect(pickLatestStableTagForMajorVersion(tagNames, 1)).toBe('v1.10.0')
    expect(pickLatestStableTagForMajorVersion(tagNames, 2)).toBe('v2.0.0')
    expect(pickLatestStableTagForMajorVersion(tagNames, 3)).toBeNull()
  })

  it('caches tag fetches in memory', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ name: 'v1.0.0' }, { name: 'v1.2.0' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const firstFetch = await fetchGitHubRepositoryTagNames('agents-repo', 'registry')
    const secondFetch = await fetchGitHubRepositoryTagNames('agents-repo', 'registry')

    expect(firstFetch).toEqual(['v1.0.0', 'v1.2.0'])
    expect(secondFetch).toEqual(['v1.0.0', 'v1.2.0'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not abort shared in-flight tag fetches when one caller aborts', async () => {
    let resolveFetch!: (value: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const abortController = new AbortController()
    const tagsUrl = 'https://api.github.com/repos/agents-repo/registry/tags?per_page=100'
    const abortedFetch = fetchRegistryRepositoryTagNames(tagsUrl, {
      signal: abortController.signal,
      repositoryKey: 'agents-repo/registry',
    })
    const sharedFetch = fetchRegistryRepositoryTagNames(tagsUrl, {
      repositoryKey: 'agents-repo/registry',
    })

    abortController.abort()

    await expect(abortedFetch).rejects.toMatchObject({ name: 'AbortError' })

    resolveFetch(
      new Response(JSON.stringify([{ name: 'v1.0.0' }, { name: 'v1.2.0' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(sharedFetch).resolves.toEqual(['v1.0.0', 'v1.2.0'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
