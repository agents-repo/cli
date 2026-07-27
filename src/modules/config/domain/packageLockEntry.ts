import type { InstallTargetId } from '../../registry/domain/package.js'
import { INSTALL_TARGET_IDS } from '../../registry/domain/package.js'
import { LockValidationError } from './configErrors.js'
import {
  isExactSemver,
  isQualifiedPackageId,
  isValidInstallTargetId,
  isValidLockIntegrity,
  isValidRfc3339Timestamp,
} from './validators.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'

export interface TargetLockSlot {
  readonly integrity: string
  readonly artifact: string
}

export interface NormalizedPackageLockEntry {
  readonly version: string
  readonly byTarget: Readonly<Partial<Record<InstallTargetId, TargetLockSlot>>>
}

export const sortCanonicalInstallTargetIds = (
  ids: readonly InstallTargetId[],
): InstallTargetId[] => {
  const order = new Map(INSTALL_TARGET_IDS.map((id, index) => [id, index]))
  const unique = [...new Set(ids)]
  return unique.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0))
}

export const mergeTargetLockSlot = (
  existing: NormalizedPackageLockEntry | undefined,
  targetId: InstallTargetId,
  version: string,
  slot: TargetLockSlot,
): NormalizedPackageLockEntry => {
  const versionChanged =
    existing !== undefined && existing.version !== version

  const byTarget = versionChanged
    ? { [targetId]: slot }
    : { ...(existing?.byTarget ?? {}), [targetId]: slot }

  return {
    version,
    byTarget,
  }
}

export const expectedLockArtifactName = (
  version: string,
  targetId: InstallTargetId,
): string => `${version}-${targetId}.zip`

const assertLockArtifactMatchesVersion = (
  packageId: string,
  version: string,
  targetId: InstallTargetId,
  artifact: string,
): void => {
  const expected = expectedLockArtifactName(version, targetId)
  if (artifact !== expected) {
    throw new LockValidationError(
      `Lock entry for ${packageId} byTarget.${targetId} artifact must be ${expected}`,
    )
  }
}

export const serializePackageLockEntryV2 = (
  entry: NormalizedPackageLockEntry,
): Record<string, unknown> => {
  const byTarget: Record<string, TargetLockSlot> = {}
  for (const id of INSTALL_TARGET_IDS) {
    const slot = entry.byTarget[id]
    if (slot !== undefined) {
      byTarget[id] = slot
    }
  }

  return {
    version: entry.version,
    byTarget,
  }
}

export const parsePackageLockEntry = (
  packageId: string,
  entry: unknown,
  lockfileVersion: number,
): NormalizedPackageLockEntry => {
  if (!isQualifiedPackageId(packageId)) {
    throw new LockValidationError(`Invalid package id in lock file: ${packageId}`)
  }

  if (!isPlainObject(entry)) {
    throw new LockValidationError(`Lock entry for ${packageId} must be an object`)
  }

  if (typeof entry.version !== 'string' || !isExactSemver(entry.version)) {
    throw new LockValidationError(`Lock entry for ${packageId} has invalid version`)
  }

  if (lockfileVersion === 1) {
    return parseV1FlatPackageEntry(packageId, entry)
  }

  if (lockfileVersion === 2) {
    return parseV2ByTargetPackageEntry(packageId, entry)
  }

  throw new LockValidationError(`Unsupported lock entry format for ${packageId}`)
}

const parseV1FlatPackageEntry = (
  packageId: string,
  entry: Record<string, unknown>,
): NormalizedPackageLockEntry => {
  if (typeof entry.target !== 'string' || !isValidInstallTargetId(entry.target)) {
    throw new LockValidationError(`Lock entry for ${packageId} has invalid target`)
  }

  const slot = readTargetSlot(packageId, entry.version as string, entry.target, entry)

  if (entry.resolved !== undefined) {
    if (typeof entry.resolved !== 'string' || !isValidRfc3339Timestamp(entry.resolved)) {
      throw new LockValidationError(`Lock entry for ${packageId} has invalid resolved timestamp`)
    }
  }

  return {
    version: entry.version as string,
    byTarget: { [entry.target]: slot },
  }
}

const parseV2ByTargetPackageEntry = (
  packageId: string,
  entry: Record<string, unknown>,
): NormalizedPackageLockEntry => {
  if (!isPlainObject(entry.byTarget)) {
    throw new LockValidationError(`Lock entry for ${packageId} must include byTarget`)
  }

  const packageVersion = entry.version as string
  const byTarget: Partial<Record<InstallTargetId, TargetLockSlot>> = {}
  for (const [rawTargetId, rawSlot] of Object.entries(entry.byTarget)) {
    if (!isValidInstallTargetId(rawTargetId)) {
      throw new LockValidationError(`Lock entry for ${packageId} has invalid target id "${rawTargetId}"`)
    }
    if (!isPlainObject(rawSlot)) {
      throw new LockValidationError(`Lock entry for ${packageId} byTarget.${rawTargetId} must be an object`)
    }
    byTarget[rawTargetId] = readTargetSlot(packageId, packageVersion, rawTargetId, rawSlot)
  }

  if (Object.keys(byTarget).length === 0) {
    throw new LockValidationError(`Lock entry for ${packageId} byTarget must not be empty`)
  }

  return {
    version: packageVersion,
    byTarget,
  }
}

const readTargetSlot = (
  packageId: string,
  version: string,
  targetId: InstallTargetId,
  slotSource: Record<string, unknown>,
): TargetLockSlot => {
  if (typeof slotSource.integrity !== 'string' || !isValidLockIntegrity(slotSource.integrity)) {
    throw new LockValidationError(`Lock entry for ${packageId} has invalid integrity`)
  }

  if (typeof slotSource.artifact !== 'string' || slotSource.artifact.trim().length === 0) {
    throw new LockValidationError(`Lock entry for ${packageId} has invalid artifact`)
  }

  assertLockArtifactMatchesVersion(packageId, version, targetId, slotSource.artifact)

  return {
    integrity: slotSource.integrity,
    artifact: slotSource.artifact,
  }
}
