export const PACKAGE_STATUS_VALUES = ['active', 'deprecated', 'archived', 'yanked'] as const
export type PackageStatus = (typeof PACKAGE_STATUS_VALUES)[number]

export const PACKAGE_COST_BANDS = ['minimal', 'low', 'moderate', 'high', 'critical', 'mixed'] as const
export type PackageCostBand = (typeof PACKAGE_COST_BANDS)[number]

export const INSTALL_TARGET_IDS = [
  'github-copilot',
  'claude-code',
  'cursor',
  'openai-codex',
] as const
export type InstallTargetId = (typeof INSTALL_TARGET_IDS)[number]

export const INDEX_INSTALL_TARGET_STATUSES = ['supported', 'experimental'] as const
export type IndexInstallTargetStatus = (typeof INDEX_INSTALL_TARGET_STATUSES)[number]

export interface InstallTargetEntry {
  id: InstallTargetId
  status: IndexInstallTargetStatus
}

export interface RegistryPackage {
  id: string
  namespace: string
  package: string
  path?: string
  name: string
  description: string
  owner: string
  latest: string
  tags: string[]
  status: PackageStatus
  category: string
  estimateOverallCost: {
    estimatedCost?: number
    band: PackageCostBand
  }
  quickstart?: string
  installTargets?: InstallTargetEntry[]
}

export interface RegistryCatalog {
  schemaVersion: string
  updatedAt: string
  aliases?: Record<string, string>
  packages: RegistryPackage[]
}

export const resolvePackageRef = (
  idOrLeaf: string,
  aliases?: Record<string, string>,
): string => {
  const trimmed = idOrLeaf.trim()
  if (trimmed.includes('/')) {
    return trimmed
  }

  return aliases?.[trimmed] ?? trimmed
}
