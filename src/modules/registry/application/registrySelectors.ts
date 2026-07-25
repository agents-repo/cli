import type { RegistryCatalog, RegistryPackage } from '../domain/package.js'

const createSearchIndex = (pkg: RegistryPackage, catalog: RegistryCatalog): string => {
  const aliasKeys = Object.entries(catalog.aliases ?? {})
    .filter(([, qualifiedId]) => qualifiedId === pkg.id)
    .map(([alias]) => alias)

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

  return catalog.packages.filter((pkg) => {
    const searchIndex = createSearchIndex(pkg, catalog)

    if (searchIndex.includes(normalizedQuery)) {
      return true
    }

    return normalizedOwnerQuery !== normalizedQuery && searchIndex.includes(normalizedOwnerQuery)
  })
}

export const formatCatalogUpdatedAt = (value: string): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}
