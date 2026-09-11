import AdmZip from 'adm-zip'

import { PATH_ENCODING_VERSION } from '../../src/modules/install/domain/pathEncoding.js'
import type { PackageManifest } from '../../src/modules/registry/domain/manifest.js'
import type { PackageMetadata } from '../../src/modules/registry/domain/packageMetadata.js'
import type { RegistryCatalog } from '../../src/modules/registry/domain/package.js'

export const INSTALL_TEST_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export const SAMPLE_SOURCE_AGENT_ID = 'sample'
export const SAMPLE_INSTALL_LEAF = 'agents-repo-sample-agent-sample'
export const SAMPLE_SKILL_ZIP_ENTRY = `.cursor/skills/agents-repo/sample-agent/${SAMPLE_INSTALL_LEAF}/SKILL.md`
export const SAMPLE_SKILL_REL_PATH = SAMPLE_SKILL_ZIP_ENTRY

export const OTHER_INSTALL_LEAF = 'agents-repo-other-agent-other'
export const OTHER_SKILL_ZIP_ENTRY = `.cursor/skills/agents-repo/other-agent/${OTHER_INSTALL_LEAF}/SKILL.md`
export const OTHER_SKILL_REL_PATH = OTHER_SKILL_ZIP_ENTRY

export const COLLISION_SOURCE_AGENT_ID = 'planner'
export const COLLISION_PKG_A_ID = 'acme/alpha'
export const COLLISION_PKG_B_ID = 'acme/beta'
export const COLLISION_PKG_A_LEAF = 'acme-alpha-planner'
export const COLLISION_PKG_B_LEAF = 'acme-beta-planner'
export const COLLISION_PKG_A_SKILL_ENTRY = `.cursor/skills/acme/alpha/${COLLISION_PKG_A_LEAF}/SKILL.md`
export const COLLISION_PKG_B_SKILL_ENTRY = `.cursor/skills/acme/beta/${COLLISION_PKG_B_LEAF}/SKILL.md`

const qualifiedArtifact = (target: 'cursor' | 'github-copilot', file: string) => ({
  target,
  file,
  sha256: INSTALL_TEST_SHA256,
  pathEncoding: PATH_ENCODING_VERSION,
})

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

export const makeDualPackageInstallCatalog = (
  options: { readonly status?: 'active' | 'deprecated' | 'yanked' } = {},
): RegistryCatalog => ({
  schemaVersion: '1.3.0',
  updatedAt: '2026-01-01T00:00:00.000Z',
  aliases: {
    'sample-agent': 'agents-repo/sample-agent',
  },
  packages: [
    ...(makeInstallTestCatalog(options).packages),
    {
      id: 'agents-repo/other-agent',
      namespace: 'agents-repo',
      package: 'other-agent',
      name: 'other-agent',
      description: 'Second package for bulk install tests.',
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

export const makeCollisionInstallCatalog = (): RegistryCatalog => ({
  schemaVersion: '1.3.0',
  updatedAt: '2026-01-01T00:00:00.000Z',
  packages: [
    {
      id: COLLISION_PKG_A_ID,
      namespace: 'acme',
      package: 'alpha',
      name: 'alpha',
      description: 'Collision test package A.',
      owner: 'acme',
      latest: '1.0.0',
      tags: ['sample'],
      status: 'active',
      category: 'agent',
      estimateOverallCost: { band: 'low' },
      installTargets: [{ id: 'cursor', status: 'supported' }],
    },
    {
      id: COLLISION_PKG_B_ID,
      namespace: 'acme',
      package: 'beta',
      name: 'beta',
      description: 'Collision test package B.',
      owner: 'acme',
      latest: '1.0.0',
      tags: ['sample'],
      status: 'active',
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
      artifacts: [qualifiedArtifact('cursor', '1.0.0-cursor.zip')],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
})

export const makeMultiTargetInstallTestManifest = (): PackageManifest => ({
  schemaVersion: '1.1.0',
  name: 'sample-agent',
  latest: '1.0.0',
  versions: [
    {
      version: '1.0.0',
      artifacts: [
        qualifiedArtifact('cursor', '1.0.0-cursor.zip'),
        qualifiedArtifact('github-copilot', '1.0.0-github-copilot.zip'),
      ],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
})

export const makeMultiTargetInstallTestMetadata = (): PackageMetadata => ({
  ...makeInstallTestMetadata(),
  compatibility: {
    canonicalFormat: 'agents-repo.agent-instruction@1.0.0',
    targets: [
      { id: 'cursor', status: 'supported' },
      { id: 'github-copilot', status: 'supported' },
    ],
  },
})

export const makeInstallTestOtherManifest = (): PackageManifest => ({
  schemaVersion: '1.1.0',
  name: 'other-agent',
  latest: '1.0.0',
  versions: [
    {
      version: '1.0.0',
      artifacts: [qualifiedArtifact('cursor', '1.0.0-cursor.zip')],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
})

export const makeCollisionManifest = (packageName: 'alpha' | 'beta'): PackageManifest => ({
  schemaVersion: '1.1.0',
  name: packageName,
  latest: '1.0.0',
  versions: [
    {
      version: '1.0.0',
      artifacts: [qualifiedArtifact('cursor', '1.0.0-cursor.zip')],
      srcArtifact: '1.0.0-src.zip',
      srcSha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
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
    SAMPLE_SKILL_ZIP_ENTRY,
    Buffer.from(`---
name: ${SAMPLE_INSTALL_LEAF}
description: Sample skill for install tests.
version: 1.0.0
---
Body
`),
  )
  return zip.toBuffer()
}

export const buildLegacyCursorSkillZip = (): Buffer => {
  const zip = new AdmZip()
  zip.addFile(
    '.cursor/skills/sample/SKILL.md',
    Buffer.from(`---
name: sample
description: Legacy flat skill for migration tests.
version: 1.0.0
---
Body
`),
  )
  return zip.toBuffer()
}

export const buildOtherCursorSkillZip = (): Buffer => {
  const zip = new AdmZip()
  zip.addFile(
    OTHER_SKILL_ZIP_ENTRY,
    Buffer.from(`---
name: ${OTHER_INSTALL_LEAF}
description: Other skill for bulk install tests.
version: 1.0.0
---
Body
`),
  )
  return zip.toBuffer()
}

export const buildCollisionCursorSkillZip = (options: {
  readonly zipEntry: string
  readonly installLeaf: string
}): Buffer => {
  const zip = new AdmZip()
  zip.addFile(
    options.zipEntry,
    Buffer.from(`---
name: ${options.installLeaf}
description: Shared source agent id collision test skill.
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
    `agents/${SAMPLE_INSTALL_LEAF}.agent.md`,
    Buffer.from(`---
name: ${SAMPLE_INSTALL_LEAF}
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
