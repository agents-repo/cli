import type { InstallTargetId } from '../domain/package.js'
import type { ManifestArtifact, PackageManifest } from '../domain/manifest.js'
import { ManifestArtifactNotFoundError, ManifestVersionNotFoundError } from '../domain/errors.js'
import {
  buildRegistryArtifactFileUrl,
  buildRegistryArtifactUrl,
} from '../infrastructure/registrySourceUrl.js'

export const findManifestArtifact = (
  manifest: PackageManifest,
  version: string,
  targetId: InstallTargetId,
): ManifestArtifact => {
  const versionEntry = manifest.versions.find((entry) => entry.version === version)

  if (!versionEntry) {
    throw new ManifestVersionNotFoundError(version, manifest.name)
  }

  const artifact = versionEntry.artifacts.find((entry) => entry.target === targetId)

  if (!artifact) {
    throw new ManifestArtifactNotFoundError(targetId, version)
  }

  return artifact
}

export const buildCatalogArtifactUrl = (
  registryBaseUrl: string,
  namespace: string,
  packageId: string,
  version: string,
  targetId: InstallTargetId,
): string => buildRegistryArtifactUrl(registryBaseUrl, namespace, packageId, version, targetId)

export const buildManifestArtifactUrl = (
  registryBaseUrl: string,
  namespace: string,
  packageId: string,
  version: string,
  artifactFile: string,
): string => buildRegistryArtifactFileUrl(registryBaseUrl, namespace, packageId, version, artifactFile)
