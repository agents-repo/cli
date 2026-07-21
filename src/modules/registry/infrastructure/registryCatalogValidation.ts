import {
  INDEX_INSTALL_TARGET_STATUSES,
  INSTALL_TARGET_IDS,
  PACKAGE_COST_BANDS,
  PACKAGE_STATUS_VALUES,
  type InstallTargetEntry,
  type RegistryCatalog,
  type RegistryPackage,
} from '../domain/package.js'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

const isValidDateString = (value: string): boolean => {
  return Number.isFinite(Date.parse(value))
}

const isPackageStatus = (value: unknown): value is RegistryPackage['status'] => {
  return typeof value === 'string' && (PACKAGE_STATUS_VALUES as readonly string[]).includes(value)
}

const isPackageCostBand = (value: unknown): value is RegistryPackage['estimateOverallCost']['band'] => {
  return typeof value === 'string' && (PACKAGE_COST_BANDS as readonly string[]).includes(value)
}

const isInstallTargetId = (value: unknown): value is InstallTargetEntry['id'] => {
  return typeof value === 'string' && (INSTALL_TARGET_IDS as readonly string[]).includes(value)
}

const isIndexInstallTargetStatus = (value: unknown): value is InstallTargetEntry['status'] => {
  return typeof value === 'string' && (INDEX_INSTALL_TARGET_STATUSES as readonly string[]).includes(value)
}

const isEstimateOverallCost = (
  value: unknown,
): value is RegistryPackage['estimateOverallCost'] => {
  if (!isRecord(value)) {
    return false
  }

  if (!isPackageCostBand(value.band)) {
    return false
  }

  if (value.estimatedCost === undefined) {
    return true
  }

  return (
    typeof value.estimatedCost === 'number' &&
    Number.isInteger(value.estimatedCost) &&
    value.estimatedCost >= 1 &&
    value.estimatedCost <= 10
  )
}

const isInstallTargets = (value: unknown): value is InstallTargetEntry[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return false
  }

  const seen = new Set<string>()

  for (const entry of value) {
    if (!isRecord(entry)) {
      return false
    }

    if (!isInstallTargetId(entry.id) || !isIndexInstallTargetStatus(entry.status)) {
      return false
    }

    if (seen.has(entry.id)) {
      return false
    }

    seen.add(entry.id)
  }

  return true
}

const hasRegistryPackageStrings = (value: Record<string, unknown>): boolean => {
  return (
    typeof value.id === 'string' &&
    typeof value.namespace === 'string' &&
    typeof value.package === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.latest === 'string' &&
    typeof value.category === 'string'
  )
}

const isRegistryPackage = (value: unknown): value is RegistryPackage => {
  if (!isRecord(value)) {
    return false
  }

  if (!hasRegistryPackageStrings(value)) {
    return false
  }

  if (!isStringArray(value.tags)) {
    return false
  }

  if (!isPackageStatus(value.status)) {
    return false
  }

  if (!isEstimateOverallCost(value.estimateOverallCost)) {
    return false
  }

  if (value.quickstart !== undefined && typeof value.quickstart !== 'string') {
    return false
  }

  if (value.installTargets !== undefined && !isInstallTargets(value.installTargets)) {
    return false
  }

  return true
}

const isAliases = (value: unknown): value is Record<string, string> => {
  if (!isRecord(value)) {
    return false
  }

  return Object.entries(value).every(
    ([key, aliasValue]) => typeof key === 'string' && typeof aliasValue === 'string',
  )
}

export const isRegistryCatalog = (value: unknown): value is RegistryCatalog => {
  if (!isRecord(value)) {
    return false
  }

  if (
    typeof value.schemaVersion !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isValidDateString(value.updatedAt)
  ) {
    return false
  }

  if (value.aliases !== undefined && !isAliases(value.aliases)) {
    return false
  }

  return Array.isArray(value.packages) && value.packages.every((pkg) => isRegistryPackage(pkg))
}
