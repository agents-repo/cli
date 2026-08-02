import { buildManifestArtifactUrl } from '../../registry/application/resolveArtifact.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import type { TargetLockSlot } from '../../config/domain/packageLockEntry.js'
import type { InstallTargetId } from '../../registry/domain/package.js'

export interface FrozenInstallSlotPlan {
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly slot: TargetLockSlot
  readonly artifactUrl: string
}

export const planFrozenInstallSlot = (options: {
  readonly catalogResult: RegistryCatalogLoadResult
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly slot: TargetLockSlot
}): FrozenInstallSlotPlan => {
  const pkg = resolvePackageInCatalog(options.catalogResult.catalog, options.packageId)
  const artifactUrl = buildManifestArtifactUrl(
    options.catalogResult.registryBaseUrl,
    pkg.namespace,
    pkg.package,
    options.version,
    options.slot.artifact,
  )

  return {
    packageId: pkg.id,
    version: options.version,
    target: options.target,
    slot: options.slot,
    artifactUrl,
  }
}
