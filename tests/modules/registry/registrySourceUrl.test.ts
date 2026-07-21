import { describe, expect, it } from 'vitest'
import {
  buildRegistryArtifactPath,
  buildRegistryArtifactUrl,
  buildRegistryIndexUrl,
  buildRegistryManifestPath,
  buildRegistryManifestUrl,
  buildRegistryPackageBrowseUrl,
  getRegistryBaseUrlFromIndexUrl,
  getRegistryIndexCacheLookupKey,
  getRegistrySourceCacheIdentity,
  normalizeRegistryBaseUrl,
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '../../../src/modules/registry/infrastructure/registrySourceUrl.js'

describe('registrySourceUrl', () => {
  it('normalizes GitHub repository URLs to the default registry ref when no tree ref is present', () => {
    expect(normalizeRegistryBaseUrl('https://github.com/agents-repo/registry')).toBe(
      'https://raw.githubusercontent.com/agents-repo/registry/v2.x',
    )
  })

  it('builds index URL while preserving existing query parameters', () => {
    expect(buildRegistryIndexUrl('https://registry-proxy.example.workers.dev?ref=main', 'packages/index.json')).toBe(
      'https://registry-proxy.example.workers.dev/packages/index.json?ref=main',
    )
  })

  it('builds artifact path with namespace, version and target id', () => {
    expect(buildRegistryArtifactPath('agents-repo', 'hello-agent', '1.0.0', 'cursor')).toBe(
      'packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip',
    )
  })

  it('builds artifact URL for raw GitHub base URLs', () => {
    expect(
      buildRegistryArtifactUrl(
        'https://raw.githubusercontent.com/agents-repo/registry/main',
        'agents-repo',
        'hello-agent',
        '1.1.0',
        'claude-code',
      ),
    ).toBe(
      'https://raw.githubusercontent.com/agents-repo/registry/main/packages/agents-repo/hello-agent/versions/1.1.0/1.1.0-claude-code.zip',
    )
  })

  it('builds manifest path and URL', () => {
    expect(buildRegistryManifestPath('agents-repo', 'hello-agent')).toBe(
      'packages/agents-repo/hello-agent/versions/manifest.json',
    )
    expect(
      buildRegistryManifestUrl(
        'https://raw.githubusercontent.com/agents-repo/registry/main',
        'agents-repo',
        'hello-agent',
      ),
    ).toBe(
      'https://raw.githubusercontent.com/agents-repo/registry/main/packages/agents-repo/hello-agent/versions/manifest.json',
    )
  })

  it('trims leading and trailing slashes', () => {
    expect(trimTrailingSlashes('https://example.com///')).toBe('https://example.com')
    expect(trimLeadingSlashes('///packages/index.json')).toBe('packages/index.json')
  })

  it('builds cache lookup keys that ignore query-string refs', () => {
    expect(
      getRegistryIndexCacheLookupKey(
        'https://registry-proxy.example.workers.dev/packages/index.json?ref=v1.2.0',
        'packages/index.json',
      ),
    ).toBe('https://registry-proxy.example.workers.dev/packages/index.json')
  })

  it('builds package browse URL from GitHub repository root', () => {
    expect(
      buildRegistryPackageBrowseUrl('https://github.com/agents-repo/registry', 'agents-repo', 'hello-agent'),
    ).toBe('https://github.com/agents-repo/registry/tree/v2.x/packages/agents-repo/hello-agent')
  })

  it('reconstructs base URLs from index URLs', () => {
    expect(
      getRegistryBaseUrlFromIndexUrl(
        buildRegistryIndexUrl('https://example.com/base/', 'packages/index.json'),
        'packages/index.json',
      ),
    ).toBe('https://example.com/base')
  })

  it('builds cache lookup keys that normalize raw GitHub path refs', () => {
    expect(
      getRegistrySourceCacheIdentity('https://github.com/agents-repo/registry/tree/v1.x', 'packages/index.json'),
    ).toEqual({
      lookupKey: 'https://raw.githubusercontent.com/agents-repo/registry/{ref}/packages/index.json',
      indexPath: 'packages/index.json',
      sourceRef: null,
    })
  })
})
