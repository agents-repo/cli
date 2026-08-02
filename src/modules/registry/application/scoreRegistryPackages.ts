import type { InstallTargetId, RegistryCatalog, RegistryPackage } from '../domain/package.js'
import type { ProjectMetadataSignal } from './collectProjectMetadataSignals.js'

export interface ScoredRegistryPackage {
  readonly pkg: RegistryPackage
  readonly score: number
  readonly matchedSignals: readonly string[]
}

export interface ScoreRegistryPackagesOptions {
  readonly catalog: RegistryCatalog
  readonly signals: readonly ProjectMetadataSignal[]
  readonly installedPackageIds: ReadonlySet<string>
  readonly configuredTargets?: readonly InstallTargetId[]
}

const buildAliasKeysByPackageId = (catalog: RegistryCatalog): ReadonlyMap<string, readonly string[]> => {
  const aliasKeysByPackageId = new Map<string, string[]>()

  for (const [alias, qualifiedId] of Object.entries(catalog.aliases ?? {})) {
    const keys = aliasKeysByPackageId.get(qualifiedId) ?? []
    keys.push(alias.toLowerCase())
    aliasKeysByPackageId.set(qualifiedId, keys)
  }

  return aliasKeysByPackageId
}

const tagExactPoints = (signal: string, tags: readonly string[]): number => {
  return tags.some((tag) => tag.toLowerCase() === signal) ? 3 : 0
}

const tagOrCategorySubstringPoints = (
  signal: string,
  tags: readonly string[],
  category: string,
): number => {
  if (signal.length < 3) {
    return 0
  }

  const normalizedCategory = category.toLowerCase()
  if (normalizedCategory.includes(signal)) {
    return 2
  }

  return tags.some((tag) => tag.toLowerCase().includes(signal)) ? 2 : 0
}

const dependencyLeafOrAliasPoints = (
  signal: ProjectMetadataSignal,
  pkg: RegistryPackage,
  aliasKeys: readonly string[],
): number => {
  if (signal.source !== 'dependency' && signal.source !== 'name') {
    return 0
  }

  const leaf = pkg.package.toLowerCase()
  if (signal.value === leaf) {
    return 1
  }

  return aliasKeys.some((alias) => alias === signal.value) ? 1 : 0
}

const readmeTokenPoints = (
  signal: ProjectMetadataSignal,
  tags: readonly string[],
  category: string,
): number => {
  if (signal.source !== 'readme') {
    return 0
  }

  const normalizedCategory = category.toLowerCase()
  if (signal.value === normalizedCategory) {
    return 1
  }

  if (tags.some((tag) => tag.toLowerCase() === signal.value)) {
    return 1
  }

  if (signal.value.length >= 3) {
    if (normalizedCategory.includes(signal.value)) {
      return 1
    }

    if (tags.some((tag) => tag.toLowerCase().includes(signal.value))) {
      return 1
    }
  }

  return 0
}

const targetBoostPoints = (
  pkg: RegistryPackage,
  configuredTargets: readonly InstallTargetId[] | undefined,
): number => {
  if (configuredTargets === undefined || configuredTargets.length === 0) {
    return 0
  }

  const installTargetIds = new Set((pkg.installTargets ?? []).map((entry) => entry.id))
  return configuredTargets.some((target) => installTargetIds.has(target)) ? 2 : 0
}

const scorePackage = (
  pkg: RegistryPackage,
  signals: readonly ProjectMetadataSignal[],
  aliasKeys: readonly string[],
  configuredTargets: readonly InstallTargetId[] | undefined,
): ScoredRegistryPackage => {
  const tags = pkg.tags
  const category = pkg.category
  const matchedSignals = new Set<string>()
  let score = targetBoostPoints(pkg, configuredTargets)

  for (const signal of signals) {
    const contributions = [
      tagExactPoints(signal.value, tags),
      tagOrCategorySubstringPoints(signal.value, tags, category),
      dependencyLeafOrAliasPoints(signal, pkg, aliasKeys),
      readmeTokenPoints(signal, tags, category),
    ]

    const added = contributions.reduce((sum, points) => sum + points, 0)
    if (added > 0) {
      matchedSignals.add(signal.value)
      score += added
    }
  }

  return {
    pkg,
    score,
    matchedSignals: [...matchedSignals].sort((left, right) => left.localeCompare(right)),
  }
}

export const scoreRegistryPackages = (
  options: ScoreRegistryPackagesOptions,
): ScoredRegistryPackage[] => {
  const aliasKeysByPackageId = buildAliasKeysByPackageId(options.catalog)
  const configuredTargets = options.configuredTargets

  const scored = options.catalog.packages
    .filter((pkg) => pkg.status !== 'yanked')
    .filter((pkg) => !options.installedPackageIds.has(pkg.id))
    .map((pkg) =>
      scorePackage(
        pkg,
        options.signals,
        aliasKeysByPackageId.get(pkg.id) ?? [],
        configuredTargets,
      ),
    )
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.pkg.id.localeCompare(right.pkg.id)
    })

  return scored
}
