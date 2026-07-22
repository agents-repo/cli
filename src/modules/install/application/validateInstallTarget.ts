import type { InstallTargetId, RegistryPackage } from '../../registry/domain/package.js'
import {
  findManifestArtifact,
} from '../../registry/application/resolveArtifact.js'
import { InstallTargetUnsupportedError, MetadataSchemaError } from '../../registry/domain/errors.js'
import type { PackageManifest } from '../../registry/domain/manifest.js'
import type { PackageMetadata } from '../../registry/domain/packageMetadata.js'
const isActiveIndexTarget = (
  installTargets: RegistryPackage['installTargets'],
  targetId: InstallTargetId,
): boolean => {
  if (installTargets === undefined) {
    return true
  }

  const entry = installTargets.find((target) => target.id === targetId)
  if (entry === undefined) {
    return false
  }

  return entry.status === 'supported' || entry.status === 'experimental'
}

const isActiveMetadataTarget = (
  metadata: PackageMetadata,
  targetId: InstallTargetId,
): boolean => {
  if (metadata.compatibility === undefined) {
    throw new MetadataSchemaError('metadata.json compatibility is required for install target validation')
  }

  const entry = metadata.compatibility.targets.find((target) => target.id === targetId)

  if (entry === undefined) {
    return false
  }

  return entry.status === 'supported' || entry.status === 'experimental'
}

export const assertInstallTargetSupported = (
  pkg: RegistryPackage,
  metadata: PackageMetadata,
  manifest: PackageManifest,
  version: string,
  targetId: InstallTargetId,
): void => {
  if (!isActiveIndexTarget(pkg.installTargets, targetId)) {
    throw new InstallTargetUnsupportedError(
      pkg.id,
      targetId,
      'target is not listed as supported or experimental in the registry index',
    )
  }

  if (!isActiveMetadataTarget(metadata, targetId)) {
    throw new InstallTargetUnsupportedError(
      pkg.id,
      targetId,
      'target is not supported in version metadata compatibility.targets',
    )
  }

  findManifestArtifact(manifest, version, targetId)
}
