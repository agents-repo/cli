import type { InstallTargetId } from '../../registry/domain/package.js'
import type { CliManagedConfig } from '../domain/agentsConfig.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import { sortCanonicalInstallTargetIds } from '../domain/packageLockEntry.js'
import { isValidInstallTargetId } from '../domain/validators.js'

export const parseInstallTargetsArray = (raw: unknown, path: string): InstallTargetId[] => {
  if (!Array.isArray(raw)) {
    throw new ConfigValidationError(`${path} must be an array`, 'type_mismatch')
  }

  if (raw.length === 0) {
    throw new ConfigValidationError(`${path} must be a non-empty array`, 'invalid_enum')
  }

  const ids: InstallTargetId[] = []
  const seen = new Set<string>()

  for (const [index, value] of raw.entries()) {
    if (typeof value !== 'string' || !isValidInstallTargetId(value)) {
      throw new ConfigValidationError(
        `${path}[${index}] is not a supported install target id`,
        'invalid_enum',
      )
    }
    if (seen.has(value)) {
      throw new ConfigValidationError(`${path} contains duplicate id: ${value}`, 'invalid_enum')
    }
    seen.add(value)
    ids.push(value)
  }

  return sortCanonicalInstallTargetIds(ids)
}

export const resolveTargetsFromManaged = (
  managed: CliManagedConfig,
): InstallTargetId[] | undefined => {
  const fromTargets = managed.targets

  if (fromTargets !== undefined && fromTargets.length > 0) {
    return sortCanonicalInstallTargetIds(fromTargets)
  }

  return undefined
}

export const installTargetSetsEqual = (
  left: readonly InstallTargetId[],
  right: readonly InstallTargetId[],
): boolean => {
  if (left.length !== right.length) {
    return false
  }
  const sortedLeft = sortCanonicalInstallTargetIds([...left])
  const sortedRight = sortCanonicalInstallTargetIds([...right])
  return sortedLeft.every((id, index) => id === sortedRight[index])
}
