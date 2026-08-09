import {
  buildManifestArtifactUrl,
  findManifestArtifact,
} from '../../registry/application/resolveArtifact.js'
import { evaluatePackageStatusPolicy } from '../../registry/application/packageStatusPolicy.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import {
  loadPackageManifest,
  loadPackageMetadata,
} from '../../registry/infrastructure/registryRepository.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { ManifestArtifact } from '../../registry/domain/manifest.js'
import type { InstallTargetId, RegistryPackage } from '../../registry/domain/package.js'
import { resolveInstallVersion } from './resolveInstallVersion.js'
import { assertInstallTargetSupported } from './validateInstallTarget.js'

export interface PackageInstallPlan {
  readonly pkg: RegistryPackage
  readonly version: string
  readonly artifact: ManifestArtifact
  readonly artifactUrl: string
}

export const planPackageInstall = async (options: {
  readonly catalogResult: RegistryCatalogLoadResult
  readonly resolved: ResolvedAgentsConfig
  readonly packageId: string
  readonly target: InstallTargetId
  readonly warnings: string[]
}): Promise<PackageInstallPlan> => {
  const pkg = resolvePackageInCatalog(options.catalogResult.catalog, options.packageId)
  const statusPolicy = evaluatePackageStatusPolicy(pkg.status, pkg.id)
  options.warnings.push(...statusPolicy.warnings)

  const manifest = await loadPackageManifest(
    options.catalogResult.registryBaseUrl,
    pkg.namespace,
    pkg.package,
  )

  const semverRange = options.resolved.packages[pkg.id]
  const version = resolveInstallVersion(manifest, pkg.id, semverRange)

  const metadata = await loadPackageMetadata(
    options.catalogResult.registryBaseUrl,
    pkg.namespace,
    pkg.package,
    version,
  )

  assertInstallTargetSupported(pkg, metadata, manifest, version, options.target)

  const artifact = findManifestArtifact(manifest, version, options.target)
  const artifactUrl = buildManifestArtifactUrl(
    options.catalogResult.registryBaseUrl,
    pkg.namespace,
    pkg.package,
    version,
    artifact.file,
  )

  return {
    pkg,
    version,
    artifact,
    artifactUrl,
  }
}
