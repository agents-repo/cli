import { validRange } from 'semver'

import { INSTALL_TARGET_IDS, type InstallTargetId } from '../../registry/domain/package.js'

export const QUALIFIED_PACKAGE_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/

export const LOCK_INTEGRITY_PATTERN = /^sha256-[a-f0-9]{64}$/

export const MANIFEST_SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/

export const EXACT_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export const isQualifiedPackageId = (value: string): boolean => {
  return QUALIFIED_PACKAGE_ID_PATTERN.test(value)
}

export const isValidSemverRange = (value: string): boolean => {
  return validRange(value) !== null
}

export const isExactSemver = (value: string): boolean => {
  return EXACT_SEMVER_PATTERN.test(value)
}

export const isValidInstallTargetId = (value: string): value is InstallTargetId => {
  return (INSTALL_TARGET_IDS as readonly string[]).includes(value)
}

export const isValidLockIntegrity = (value: string): boolean => {
  return LOCK_INTEGRITY_PATTERN.test(value)
}

export const isManifestSha256Hex = (value: string): boolean => {
  return MANIFEST_SHA256_HEX_PATTERN.test(value)
}
