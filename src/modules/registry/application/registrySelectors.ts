import type { RegistryCatalog, RegistryPackage } from '../domain/package.js'

const buildAliasKeysByPackageId = (catalog: RegistryCatalog): ReadonlyMap<string, readonly string[]> => {
  const aliasKeysByPackageId = new Map<string, string[]>()

  for (const [alias, qualifiedId] of Object.entries(catalog.aliases ?? {})) {
    const keys = aliasKeysByPackageId.get(qualifiedId) ?? []
    keys.push(alias)
    aliasKeysByPackageId.set(qualifiedId, keys)
  }

  return aliasKeysByPackageId
}

const createSearchIndex = (pkg: RegistryPackage, aliasKeys: readonly string[]): string => {
  return [
    pkg.id,
    pkg.namespace,
    `${pkg.namespace}/${pkg.package}`,
    pkg.name,
    pkg.package,
    pkg.description,
    pkg.owner,
    `@${pkg.owner}`,
    pkg.tags.join(' '),
    aliasKeys.join(' '),
  ]
    .join(' ')
    .toLowerCase()
}

export const filterRegistryPackages = (
  catalog: RegistryCatalog,
  query: string,
): RegistryPackage[] => {
  const normalizedQuery = query.trim().toLowerCase()
  const normalizedOwnerQuery = normalizedQuery.startsWith('@')
    ? normalizedQuery.slice(1)
    : normalizedQuery

  if (!normalizedQuery) {
    return catalog.packages
  }

  const aliasKeysByPackageId = buildAliasKeysByPackageId(catalog)

  return catalog.packages.filter((pkg) => {
    const searchIndex = createSearchIndex(pkg, aliasKeysByPackageId.get(pkg.id) ?? [])

    if (searchIndex.includes(normalizedQuery)) {
      return true
    }

    return normalizedOwnerQuery !== normalizedQuery && searchIndex.includes(normalizedOwnerQuery)
  })
}

export const formatCatalogUpdatedAt = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}
