import { buildManifestArtifactUrl } from '../../registry/application/resolveArtifact.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import type { TargetLockSlot } from '../../config/domain/packageLockEntry.js'
import { sortCanonicalInstallTargetIds } from '../../config/domain/packageLockEntry.js'

export interface RemoveSlotPlan {
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly slot: TargetLockSlot
  readonly artifactUrl: string
}

export const planRemoveSlots = (options: {
  readonly catalogResult: RegistryCatalogLoadResult
  readonly packageId: string
  readonly version: string
  readonly byTarget: Readonly<Partial<Record<InstallTargetId, TargetLockSlot>>>
}): RemoveSlotPlan[] => {
  const pkg = resolvePackageInCatalog(options.catalogResult.catalog, options.packageId)
  const targetIds = sortCanonicalInstallTargetIds(
    Object.keys(options.byTarget) as InstallTargetId[],
  )

  return targetIds
    .map((target) => {
      const slot = options.byTarget[target]
      if (slot === undefined) {
        return undefined
      }

      const artifactUrl = buildManifestArtifactUrl(
        options.catalogResult.registryBaseUrl,
        pkg.namespace,
        pkg.package,
        options.version,
        slot.artifact,
      )

      return {
        packageId: pkg.id,
        version: options.version,
        target,
        slot,
        artifactUrl,
      }
    })
    .filter((plan): plan is RemoveSlotPlan => plan !== undefined)
}
