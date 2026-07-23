import AdmZip from 'adm-zip'

import type { PackageManifest } from '../../src/modules/registry/domain/manifest.js'
import type { PackageMetadata } from '../../src/modules/registry/domain/packageMetadata.js'
import type { RegistryCatalog } from '../../src/modules/registry/domain/package.js'

export const INSTALL_TEST_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export const makeInstallTestCatalog = (
  options: { readonly status?: 'active' | 'deprecated' | 'yanked' } = {},
): RegistryCatalog => ({
  schemaVersion: '1.3.0',
  updatedAt: '2026-01-01T00:00:00.000Z',
  packages: [
    {
      id: 'agents-repo/sample-agent',
      namespace: 'agents-repo',
      package: 'sample-agent',
      name: 'sample-agent',
      description: 'Sample package for install tests.',
      owner: 'agents-repo',
      latest: '1.0.0',
      tags: ['sample'],
      status: options.status ?? 'active',
      category: 'agent',
      estimateOverallCost: { band: 'low' },
      installTargets: [{ id: 'cursor', status: 'supported' }],
    },
  ],
})

export const makeInstallTestManifest = (): PackageManifest => ({
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
          sha256: INSTALL_TEST_SHA256,
        },
      ],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
})

export const makeInstallTestMetadata = (): PackageMetadata => ({
  schemaVersion: '1.0.0',
  name: 'sample-agent',
  description: 'Sample package for install tests.',
  owner: 'agents-repo',
  license: 'MIT',
  version: '1.0.0',
  compatibility: {
    canonicalFormat: 'agents-repo.agent-instruction@1.0.0',
    targets: [{ id: 'cursor', status: 'supported' }],
  },
})

export const withInstallTestArtifactSha256 = (
  manifest: PackageManifest,
  sha256: string,
): PackageManifest => {
  if (manifest.versions.length === 0) {
    return manifest
  }

  const firstVersion = manifest.versions[0]

  if (firstVersion.artifacts.length === 0) {
    return manifest
  }

  const [firstArtifact, ...restArtifacts] = firstVersion.artifacts

  return {
    ...manifest,
    versions: [
      {
        ...firstVersion,
        artifacts: [{ ...firstArtifact, sha256 }, ...restArtifacts],
      },
      ...manifest.versions.slice(1),
    ],
  }
}

export const buildCursorSkillZip = (): Buffer => {
  const zip = new AdmZip()
  zip.addFile(
    '.cursor/skills/sample/SKILL.md',
    Buffer.from(`---
name: sample
description: Sample skill for install tests.
version: 1.0.0
---
Body
`),
  )
  return zip.toBuffer()
}

export const buildGithubCopilotZip = (): Buffer => {
  const zip = new AdmZip()
  zip.addFile(
    'agents/sample.agent.md',
    Buffer.from(`---
name: sample
description: Sample agent for install tests.
version: 1.0.0
---
Body
`),
  )
  return zip.toBuffer()
}

export const buildTraversalZip = (): Buffer => {
  const zip = new AdmZip()
  zip.addFile('../evil.agent.md', Buffer.from('bad'))
  return zip.toBuffer()
}
