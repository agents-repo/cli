import type { PackageStatus } from '../domain/package.js'
import { PackageYankedError } from '../domain/errors.js'

export interface PackageStatusPolicyResult {
  warnings: string[]
}

export const evaluatePackageStatusPolicy = (status: PackageStatus, packageId: string): PackageStatusPolicyResult => {
  if (status === 'yanked') {
    throw new PackageYankedError(packageId)
  }

  const warnings: string[] = []

  if (status === 'deprecated') {
    warnings.push(`Package "${packageId}" is deprecated`)
  }

  if (status === 'archived') {
    warnings.push(`Package "${packageId}" is archived`)
  }

  return { warnings }
}
