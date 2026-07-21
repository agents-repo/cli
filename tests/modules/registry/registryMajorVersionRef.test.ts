import { describe, expect, it } from 'vitest'
import {
  extractRegistryRef,
  inferRegistryRepositoryIdentity,
  parseMajorVersionLineAlias,
  refsAreCompatibleForCatalogCacheFallback,
  substituteRegistryRef,
} from '../../../src/modules/registry/infrastructure/registryMajorVersionRef.js'

describe('registryMajorVersionRef', () => {
  it('detects major-version line aliases', () => {
    expect(parseMajorVersionLineAlias('1.x')).toEqual({ alias: '1.x', major: 1 })
    expect(parseMajorVersionLineAlias('v2.x')).toEqual({ alias: 'v2.x', major: 2 })
    expect(parseMajorVersionLineAlias('feature/foo')).toBeNull()
  })

  it('extracts refs from GitHub tree URLs and proxy query params', () => {
    expect(extractRegistryRef('https://github.com/agents-repo/registry')).toBe('v2.x')
    expect(extractRegistryRef('https://registry-proxy.example.workers.dev?ref=1.x')).toBe('1.x')
    expect(extractRegistryRef('https://raw.githubusercontent.com/agents-repo/registry/v1.2.0')).toBe('v1.2.0')
  })

  it('substitutes refs in query params and GitHub tree URLs', () => {
    expect(substituteRegistryRef('https://registry-proxy.example.workers.dev?ref=1.x', 'v1.2.0')).toBe(
      'https://registry-proxy.example.workers.dev/?ref=v1.2.0',
    )
  })

  it('infers repository identity from GitHub URLs with fallback', () => {
    expect(
      inferRegistryRepositoryIdentity(
        'https://registry-proxy.example.workers.dev?ref=1.x',
        'https://github.com/agents-repo/registry',
      ),
    ).toEqual({
      owner: 'agents-repo',
      repo: 'registry',
    })
  })

  it('matches cache fallback refs only within the same major-version line alias', () => {
    expect(refsAreCompatibleForCatalogCacheFallback('v1.x', 'v1.2.0')).toBe(true)
    expect(refsAreCompatibleForCatalogCacheFallback('v1.x', 'v2.0.0')).toBe(false)
  })
})
