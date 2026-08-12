import { describe, expect, it } from 'vitest'
import type { PackageManifest } from '../../../src/modules/registry/domain/manifest.js'
import { isPackageManifest } from '../../../src/modules/registry/infrastructure/registryManifestValidation.js'

const makeValidManifest = (): PackageManifest => ({
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
})

describe('isPackageManifest', () => {
  it('accepts a valid manifest 1.1.0 payload', () => {
    expect(isPackageManifest(makeValidManifest())).toBe(true)
  })

  it('rejects manifests with mismatched artifact file names', () => {
    const manifest = makeValidManifest()
    manifest.versions[0].artifacts[0].file = 'wrong.zip'

    expect(isPackageManifest(manifest)).toBe(false)
  })

  it('rejects manifests with invalid sha256 values', () => {
    const manifest = makeValidManifest()
    manifest.versions[0].artifacts[0].sha256 = 'not-hex'

    expect(isPackageManifest(manifest)).toBe(false)
  })

  it('accepts manifest 1.2.0 optional instructions fields', () => {
    const manifest = makeValidManifest()
    manifest.schemaVersion = '1.2.0'
    manifest.versions[0].instructionsArtifact = 'instructions.json'
    manifest.versions[0].instructionsSha256 =
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

    expect(isPackageManifest(manifest)).toBe(true)
  })

  it('rejects instructionsArtifact without instructionsSha256', () => {
    const manifest = makeValidManifest()
    manifest.schemaVersion = '1.2.0'
    manifest.versions[0].instructionsArtifact = 'instructions.json'

    expect(isPackageManifest(manifest)).toBe(false)
  })

  it('rejects instructionsSha256 without instructionsArtifact', () => {
    const manifest = makeValidManifest()
    manifest.schemaVersion = '1.2.0'
    manifest.versions[0].instructionsSha256 =
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

    expect(isPackageManifest(manifest)).toBe(false)
  })
})
