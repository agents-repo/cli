import { describe, expect, it } from 'vitest'
import { sampleRegistryCatalog } from '../../fixtures/sampleRegistryCatalog.js'
import {
  ManifestArtifactNotFoundError,
  ManifestVersionNotFoundError,
  PackageNotFoundError,
} from '../../../src/modules/registry/domain/errors.js'
import {
  buildCatalogArtifactUrl,
  buildManifestArtifactUrl,
  findManifestArtifact,
} from '../../../src/modules/registry/application/resolveArtifact.js'
import { resolvePackageInCatalog } from '../../../src/modules/registry/application/resolvePackageInCatalog.js'
import type { PackageManifest } from '../../../src/modules/registry/domain/manifest.js'

const sampleManifest: PackageManifest = {
  schemaVersion: '1.1.0',
  name: 'sample-agent',
  latest: '1.0.0',
  versions: [
    {
      version: '1.0.0',
      artifacts: [
        {
          target: 'cursor',
          file: '1.0.0-cursor.zip',
          sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}

describe('resolveArtifact', () => {
  it('finds manifest artifacts by version and target', () => {
    const artifact = findManifestArtifact(sampleManifest, '1.0.0', 'cursor')

    expect(artifact.file).toBe('1.0.0-cursor.zip')
  })

  it('throws when manifest version is missing', () => {
    expect(() => findManifestArtifact(sampleManifest, '9.9.9', 'cursor')).toThrow(
      ManifestVersionNotFoundError,
    )
  })

  it('throws when install target is missing for a version', () => {
    expect(() => findManifestArtifact(sampleManifest, '1.0.0', 'github-copilot')).toThrow(
      ManifestArtifactNotFoundError,
    )
  })

  it('matches webapp catalog artifact URLs for the same inputs', () => {
    const pkg = sampleRegistryCatalog.packages[0]
    const baseUrl = 'https://raw.githubusercontent.com/agents-repo/registry/main'

    const href = buildCatalogArtifactUrl(baseUrl, pkg.namespace, pkg.package, pkg.latest, 'cursor')

    expect(href).toBe(
      'https://raw.githubusercontent.com/agents-repo/registry/main/packages/agents-repo/sample-agent/versions/1.0.0/1.0.0-cursor.zip',
    )
  })

  it('builds manifest-file artifact URLs for install download paths', () => {
    const artifact = findManifestArtifact(sampleManifest, '1.0.0', 'cursor')
    const url = buildManifestArtifactUrl(
      'https://raw.githubusercontent.com/agents-repo/registry/main',
      'agents-repo',
      'sample-agent',
      '1.0.0',
      artifact.file,
    )

    expect(url).toContain('1.0.0-cursor.zip')
  })
})

describe('resolvePackageInCatalog', () => {
  it('resolves packages by qualified id', () => {
    const pkg = resolvePackageInCatalog(sampleRegistryCatalog, 'agents-repo/sample-agent')

    expect(pkg.name).toBe('sample-agent')
  })

  it('resolves packages by catalog alias', () => {
    const pkg = resolvePackageInCatalog(sampleRegistryCatalog, 'sample-agent')

    expect(pkg.id).toBe('agents-repo/sample-agent')
  })

  it('throws when package is not in catalog', () => {
    expect(() => resolvePackageInCatalog(sampleRegistryCatalog, 'missing/package')).toThrow(
      PackageNotFoundError,
    )
  })
})
