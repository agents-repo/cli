import type { InstallTargetId } from './package.js'

export interface ManifestArtifact {
  target: InstallTargetId
  file: string
  sha256: string
}

export interface ManifestVersionEntry {
  version: string
  artifacts: ManifestArtifact[]
  srcArtifact: string
  srcSha256: string
  createdAt: string
}

export interface PackageManifest {
  schemaVersion: string
  name: string
  latest: string
  versions: ManifestVersionEntry[]
}
