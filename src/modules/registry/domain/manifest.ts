import type { InstallTargetId } from './package.js'

export interface ManifestArtifact {
  target: InstallTargetId
  file: string
  sha256: string
  /** Registry deployment path encoding; `1` = qualified install-leaf hierarchy. */
  pathEncoding?: number
}

export interface ManifestVersionEntry {
  version: string
  artifacts: ManifestArtifact[]
  srcArtifact: string
  srcSha256: string
  createdAt: string
  instructionsArtifact?: string
  instructionsSha256?: string
}

export interface PackageManifest {
  schemaVersion: string
  name: string
  latest: string
  versions: ManifestVersionEntry[]
}
