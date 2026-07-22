import { describe, expect, it } from 'vitest'

import { assertInstallTargetSupported } from '../../../src/modules/install/application/validateInstallTarget.js'
import { InstallTargetUnsupportedError, MetadataSchemaError } from '../../../src/modules/registry/domain/errors.js'
import type { RegistryPackage } from '../../../src/modules/registry/domain/package.js'
import {
  makeInstallTestManifest,
  makeInstallTestMetadata,
} from '../../fixtures/installFixtures.js'

const basePackage: RegistryPackage = {
  id: 'agents-repo/sample-agent',
  namespace: 'agents-repo',
  package: 'sample-agent',
  name: 'sample-agent',
  description: 'Sample',
  owner: 'agents-repo',
  latest: '1.0.0',
  tags: [],
  status: 'active',
  category: 'agent',
  estimateOverallCost: { band: 'low' },
}

describe('assertInstallTargetSupported', () => {
  it('accepts supported targets from index and metadata', () => {
    expect(() =>
      assertInstallTargetSupported(
        {
          ...basePackage,
          installTargets: [{ id: 'cursor', status: 'supported' }],
        },
        makeInstallTestMetadata(),
        makeInstallTestManifest(),
        '1.0.0',
        'cursor',
      ),
    ).not.toThrow()
  })

  it('allows metadata validation when index installTargets is absent', () => {
    expect(() =>
      assertInstallTargetSupported(
        basePackage,
        makeInstallTestMetadata(),
        makeInstallTestManifest(),
        '1.0.0',
        'cursor',
      ),
    ).not.toThrow()
  })

  it('rejects missing metadata compatibility', () => {
    const withoutCompatibility = { ...makeInstallTestMetadata() }
    delete (withoutCompatibility as { compatibility?: unknown }).compatibility

    expect(() =>
      assertInstallTargetSupported(
        basePackage,
        withoutCompatibility,
        makeInstallTestManifest(),
        '1.0.0',
        'cursor',
      ),
    ).toThrow(MetadataSchemaError)
  })

  it('rejects when target is absent from index installTargets', () => {
    expect(() =>
      assertInstallTargetSupported(
        {
          ...basePackage,
          installTargets: [{ id: 'github-copilot', status: 'supported' }],
        },
        makeInstallTestMetadata(),
        makeInstallTestManifest(),
        '1.0.0',
        'cursor',
      ),
    ).toThrow(InstallTargetUnsupportedError)
  })

  it('rejects planned metadata targets', () => {
    const metadata = makeInstallTestMetadata()
    expect(() =>
      assertInstallTargetSupported(
        {
          ...basePackage,
          installTargets: [{ id: 'cursor', status: 'supported' }],
        },
        {
          ...metadata,
          compatibility: {
            canonicalFormat: 'agents-repo.agent-instruction@1.0.0',
            targets: [{ id: 'cursor', status: 'planned' }],
          },
        },
        makeInstallTestManifest(),
        '1.0.0',
        'cursor',
      ),
    ).toThrow(InstallTargetUnsupportedError)
  })
})
