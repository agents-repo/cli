import type { RegistryCatalog, RegistryPackage } from '../domain/package.js'
import { resolvePackageRef } from '../domain/package.js'
import { PackageNotFoundError } from '../domain/errors.js'

export const resolvePackageInCatalog = (
  catalog: RegistryCatalog,
  idOrLeaf: string,
): RegistryPackage => {
  const qualifiedId = resolvePackageRef(idOrLeaf, catalog.aliases)
  const pkg = catalog.packages.find((entry) => entry.id === qualifiedId)

  if (!pkg) {
    throw new PackageNotFoundError(qualifiedId)
  }

  return pkg
}
