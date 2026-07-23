import { describe, expect, it } from 'vitest'

import { resolveInstallVersion } from '../../../src/modules/install/application/resolveInstallVersion.js'
import type { PackageManifest } from '../../../src/modules/registry/domain/manifest.js'
import { NoMatchingVersionError } from '../../../src/modules/registry/domain/errors.js'

const manifest: PackageManifest = {
  schemaVersion: '1.1.0',
  name: 'demo',
  latest: '1.0.0',
  versions: [
    {
      version: '1.0.0',
      artifacts: [],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'a'.repeat(64),
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      version: '1.1.0',
      artifacts: [],
      srcArtifact: '1.1.0-src.zip',
      srcSha256: 'b'.repeat(64),
      createdAt: '2026-02-01T00:00:00.000Z',
    },
    {
      version: '2.0.0-beta.1',
      artifacts: [],
      srcArtifact: '2.0.0-beta.1-src.zip',
      srcSha256: 'c'.repeat(64),
      createdAt: '2026-03-01T00:00:00.000Z',
    },
  ],
}

describe('resolveInstallVersion', () => {
  it('picks the highest version satisfying a semver range', () => {
    expect(resolveInstallVersion(manifest, 'agents-repo/demo', '^1.0.0')).toBe('1.1.0')
  })

  it('picks the highest version for ad-hoc installs', () => {
    expect(resolveInstallVersion(manifest, 'agents-repo/demo')).toBe('1.1.0')
  })

  it('excludes prereleases unless the range includes them', () => {
    expect(() => resolveInstallVersion(manifest, 'agents-repo/demo', '2.0.0')).toThrow(
      NoMatchingVersionError,
    )
  })
})
