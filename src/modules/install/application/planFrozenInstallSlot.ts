import { buildManifestArtifactUrl } from '../../registry/application/resolveArtifact.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import type { TargetLockSlot } from '../../config/domain/packageLockEntry.js'
import type { InstallTargetId, RegistryPackage } from '../../registry/domain/package.js'

export interface FrozenInstallSlotPlan {
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly slot: TargetLockSlot
  readonly artifactUrl: string
}

export const planFrozenInstallSlot = (options: {
  readonly catalogResult: RegistryCatalogLoadResult
  readonly pkg: RegistryPackage
  readonly version: string
  readonly target: InstallTargetId
  readonly slot: TargetLockSlot
}): FrozenInstallSlotPlan => {
  const artifactUrl = buildManifestArtifactUrl(
    options.catalogResult.registryBaseUrl,
    options.pkg.namespace,
    options.pkg.package,
    options.version,
    options.slot.artifact,
  )

  return {
    packageId: options.pkg.id,
    version: options.version,
    target: options.target,
    slot: options.slot,
    artifactUrl,
  }
}
