import { INSTALL_TARGET_IDS, type InstallTargetId } from '../domain/package.js'
import type { ManifestArtifact, ManifestVersionEntry, PackageManifest } from '../domain/manifest.js'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ARTIFACT_FILE_PATTERN = /^\d+\.\d+\.\d+-[a-z0-9-]+\.zip$/
const SRC_ARTIFACT_PATTERN = /^\d+\.\d+\.\d+-src\.zip$/

const isInstallTargetId = (value: unknown): value is InstallTargetId => {
  return typeof value === 'string' && (INSTALL_TARGET_IDS as readonly string[]).includes(value)
}

const isManifestArtifact = (value: unknown): value is ManifestArtifact => {
  if (!isRecord(value)) {
    return false
  }

  if (
    !isInstallTargetId(value.target) ||
    typeof value.file !== 'string' ||
    typeof value.sha256 !== 'string'
  ) {
    return false
  }

  if (!ARTIFACT_FILE_PATTERN.test(value.file) || !SHA256_PATTERN.test(value.sha256)) {
    return false
  }

  return true
}

const isManifestVersionEntry = (value: unknown): value is ManifestVersionEntry => {
  if (!isRecord(value)) {
    return false
  }

  const { version, srcArtifact, srcSha256, createdAt, artifacts } = value

  if (
    typeof version !== 'string' ||
    typeof srcArtifact !== 'string' ||
    typeof srcSha256 !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return false
  }

  if (!SRC_ARTIFACT_PATTERN.test(srcArtifact) || !SHA256_PATTERN.test(srcSha256)) {
    return false
  }

  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return false
  }

  const seenTargets = new Set<string>()

  for (const artifact of artifacts) {
    if (!isManifestArtifact(artifact)) {
      return false
    }

    if (seenTargets.has(artifact.target)) {
      return false
    }

    seenTargets.add(artifact.target)

    const expectedFile = `${version}-${artifact.target}.zip`

    if (artifact.file !== expectedFile) {
      return false
    }
  }

  return Number.isFinite(Date.parse(createdAt))
}

export const isPackageManifest = (value: unknown): value is PackageManifest => {
  if (!isRecord(value)) {
    return false
  }

  if (
    typeof value.schemaVersion !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.latest !== 'string' ||
    !Array.isArray(value.versions) ||
    value.versions.length === 0
  ) {
    return false
  }

  return value.versions.every((entry) => isManifestVersionEntry(entry))
}
