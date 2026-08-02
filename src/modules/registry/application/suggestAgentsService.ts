import { ConfigResolver } from '../../config/application/configResolver.js'
import type { RegistryPackage } from '../domain/package.js'
import { loadRegistryCatalog } from '../infrastructure/registryRepository.js'
import {
  collectProjectMetadataSignals,
  type ProjectMetadataSignal,
} from './collectProjectMetadataSignals.js'
import { scoreRegistryPackages } from './scoreRegistryPackages.js'

export interface SuggestAgentsSuggestion {
  readonly pkg: RegistryPackage
  readonly score: number
  readonly matchedSignals: readonly string[]
}

export interface SuggestAgentsResult {
  readonly suggestions: readonly SuggestAgentsSuggestion[]
  readonly signals: readonly ProjectMetadataSignal[]
  readonly indexUrl: string
  readonly updatedAt: string
  readonly warnings: readonly string[]
}

export interface SuggestAgentsServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly yes?: boolean
  readonly limit?: number
}

const DEFAULT_LIMIT = 10

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }

  const rounded = Math.trunc(limit)
  return rounded > 0 ? rounded : DEFAULT_LIMIT
}

export class SuggestAgentsService {
  private readonly configResolver = new ConfigResolver()

  async run(options: SuggestAgentsServiceOptions = {}): Promise<SuggestAgentsResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const limit = normalizeLimit(options.limit)

    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      waiveConflicts: options.yes ?? false,
    })

    const configWarnings = resolved.warnings.map((warning) => warning.message)
    const installedIds = Object.keys(resolved.packages)

    const signalResult = collectProjectMetadataSignals({
      cwd,
      installedPackageIds: installedIds,
    })

    const catalogResult = await loadRegistryCatalog(resolved.registry)
    const scored = scoreRegistryPackages({
      catalog: catalogResult.catalog,
      signals: signalResult.signals,
      installedPackageIds: signalResult.installedPackageIds,
      configuredTargets: resolved.targets,
    })

    const suggestions = scored.slice(0, limit).map((entry) => ({
      pkg: entry.pkg,
      score: entry.score,
      matchedSignals: entry.matchedSignals,
    }))

    const warnings = [
      ...configWarnings,
      ...signalResult.warnings,
      ...catalogResult.warnings,
    ]

    return {
      suggestions,
      signals: signalResult.signals,
      indexUrl: catalogResult.indexUrl,
      updatedAt: catalogResult.catalog.updatedAt,
      warnings,
    }
  }
}
