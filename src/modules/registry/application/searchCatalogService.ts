import { ConfigResolver } from '../../config/application/configResolver.js'
import type { RegistryPackage } from '../domain/package.js'
import { loadRegistryCatalog } from '../infrastructure/registryRepository.js'
import { filterRegistryPackages } from './registrySelectors.js'

export interface SearchCatalogResult {
  readonly query: string
  readonly packages: readonly RegistryPackage[]
  readonly indexUrl: string
  readonly updatedAt: string
  readonly warnings: readonly string[]
}

export interface SearchCatalogServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly query?: string
  readonly yes?: boolean
}

export class SearchCatalogService {
  private readonly configResolver = new ConfigResolver()

  async run(options: SearchCatalogServiceOptions = {}): Promise<SearchCatalogResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const query = (options.query ?? '').trim()

    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      waiveConflicts: options.yes ?? false,
    })

    const configWarnings = resolved.warnings.map((warning) => warning.message)
    const catalogResult = await loadRegistryCatalog(resolved.registry)
    const warnings = [...configWarnings, ...catalogResult.warnings]
    const packages = filterRegistryPackages(catalogResult.catalog, query)

    return {
      query,
      packages,
      indexUrl: catalogResult.indexUrl,
      updatedAt: catalogResult.catalog.updatedAt,
      warnings,
    }
  }
}
