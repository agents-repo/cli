import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sampleRegistryCatalog } from '../../fixtures/sampleRegistryCatalog.js'
import { filterRegistryPackages, formatCatalogUpdatedAt } from '../../../src/modules/registry/application/registrySelectors.js'

describe('filterRegistryPackages', () => {
  it('returns all packages when the query is empty', () => {
    expect(filterRegistryPackages(sampleRegistryCatalog, '')).toEqual(sampleRegistryCatalog.packages)
    expect(filterRegistryPackages(sampleRegistryCatalog, '   ')).toEqual(sampleRegistryCatalog.packages)
  })

  it('matches package name', () => {
    expect(filterRegistryPackages(sampleRegistryCatalog, 'sample-agent')).toHaveLength(1)
    expect(filterRegistryPackages(sampleRegistryCatalog, 'SAMPLE')).toHaveLength(1)
  })

  it('matches qualified id and namespace path', () => {
    expect(filterRegistryPackages(sampleRegistryCatalog, 'agents-repo/sample-agent')).toHaveLength(1)
    expect(filterRegistryPackages(sampleRegistryCatalog, 'agents-repo')).toHaveLength(1)
  })

  it('matches description and owner', () => {
    expect(filterRegistryPackages(sampleRegistryCatalog, 'accessibility testing')).toHaveLength(1)
    expect(filterRegistryPackages(sampleRegistryCatalog, 'agents-repo')).toHaveLength(1)
  })

  it('strips @ prefix when matching owner', () => {
    expect(filterRegistryPackages(sampleRegistryCatalog, '@agents-repo')).toHaveLength(1)
  })

  it('matches tags', () => {
    expect(filterRegistryPackages(sampleRegistryCatalog, 'sample')).toHaveLength(1)
  })

  it('returns no matches for unrelated queries', () => {
    expect(filterRegistryPackages(sampleRegistryCatalog, 'nonexistent-package')).toHaveLength(0)
  })
})

describe('formatCatalogUpdatedAt', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('formats an ISO timestamp in en-US short date style', () => {
    expect(formatCatalogUpdatedAt('2026-01-01T00:00:00.000Z')).toBe('Jan 01, 2026')
  })
})
