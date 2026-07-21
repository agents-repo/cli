import { describe, expect, it } from 'vitest'
import { sampleRegistryCatalog } from '../../fixtures/sampleRegistryCatalog.js'
import {
  buildCatalogArtifactUrl,
  buildManifestArtifactUrl,
  findManifestArtifact,
} from '../../../src/modules/registry/application/resolveArtifact.js'
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

  it('matches webapp catalog artifact URLs for the same inputs', () => {
    const pkg = sampleRegistryCatalog.packages[0]
    const baseUrl = 'https://raw.githubusercontent.com/agents-repo/registry/main'

    const href = buildCatalogArtifactUrl(baseUrl, pkg.namespace, pkg.package, pkg.latest, 'cursor')

    expect(href).toContain('packages/agents-repo/sample-agent')
    expect(href).toContain('1.0.0-cursor.zip')
    expect(href.startsWith('https://')).toBe(true)
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
