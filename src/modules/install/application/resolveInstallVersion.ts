import semver from 'semver'

import type { PackageManifest } from '../../registry/domain/manifest.js'
import { NoMatchingVersionError } from '../../registry/domain/errors.js'

export const resolveInstallVersion = (
  manifest: PackageManifest,
  packageId: string,
  semverRange?: string,
): string => {
  const versions = manifest.versions.map((entry) => entry.version)

  if (semverRange !== undefined) {
    const match = semver.maxSatisfying(versions, semverRange, { includePrerelease: false })
    if (match === null) {
      throw new NoMatchingVersionError(packageId, semverRange)
    }
    return match
  }

  const sorted = versions
    .filter((version) => semver.prerelease(version) === null)
    .map((version) => ({ version, parsed: semver.parse(version) }))
    .filter((entry): entry is { version: string; parsed: semver.SemVer } => entry.parsed !== null)
    .sort((left, right) => semver.rcompare(left.parsed, right.parsed))

  if (sorted.length === 0) {
    throw new NoMatchingVersionError(packageId)
  }

  return sorted[0].version
}
