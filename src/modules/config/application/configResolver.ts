import { DEFAULT_REGISTRY_CONFIG } from '../../registry/infrastructure/registrySourceConfig.js'
import { ENV_AGENTS_REPO_REGISTRY_URL } from '../domain/configConstants.js'
import type { ResolvedAgentsConfig } from '../domain/agentsConfig.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import { AgentsJsonRepository } from '../infrastructure/agentsJsonRepository.js'
import {
  resolveGlobalConfigPaths,
  resolveProjectConfigPaths,
} from '../infrastructure/configPaths.js'
import { extractCliManagedConfig } from './cliManagedSlice.js'
import { ConflictDetector } from './conflictDetector.js'
import { SchemaGate, getActiveGateTarget } from './schemaGate.js'
import { resolveTargetsFromManaged } from './resolveTargets.js'

export interface ConfigResolverOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly waiveConflicts?: boolean
  readonly requireTarget?: boolean
  readonly globalScope?: boolean
}

export class ConfigResolver {
  private readonly schemaGate = new SchemaGate()
  private readonly conflictDetector = new ConflictDetector()
  private readonly agentsJsonRepository = new AgentsJsonRepository()

  async resolve(options: ConfigResolverOptions = {}): Promise<ResolvedAgentsConfig> {
    const env = options.env ?? process.env
    const globalScope = options.globalScope === true

    const { configPath, lockPath, configRoot } = globalScope
      ? resolveGlobalConfigPaths(env)
      : resolveProjectConfigPaths(options.cwd ?? process.cwd(), env)

    const rawDocument = await this.agentsJsonRepository.read(configPath)
    const gateMode = this.schemaGate.determineMode(rawDocument)

    const warnings =
      rawDocument === null
        ? []
        : this.conflictDetector.detectOrThrow(rawDocument, gateMode, {
            waiveConflicts: options.waiveConflicts,
          })

    const activeTarget =
      rawDocument === null ? {} : getActiveGateTarget(rawDocument, gateMode)
    const managed = extractCliManagedConfig(activeTarget)

    let registry = managed.registry ?? DEFAULT_REGISTRY_CONFIG
    const registryUrlOverride = env[ENV_AGENTS_REPO_REGISTRY_URL]?.trim()
    if (registryUrlOverride) {
      registry = { ...registry, url: registryUrlOverride }
      try {
        const refFromUrl = new URL(registryUrlOverride).searchParams.get('ref')?.trim()
        if (refFromUrl !== undefined && refFromUrl.length > 0) {
          registry = { ...registry, ref: refFromUrl }
        }
      } catch {
        // Keep configured ref when override is not a parseable URL.
      }
    }

    const packages = managed.packages ?? {}
    const resolvedTargets = resolveTargetsFromManaged(managed)

    if (options.requireTarget && resolvedTargets === undefined) {
      throw new ConfigValidationError('Install target is required but missing from config', 'missing_target')
    }

    return {
      gateMode,
      configPath,
      lockPath,
      configRoot,
      schemaVersion: managed.schemaVersion,
      registry,
      targets: resolvedTargets,
      packages,
      warnings,
      rawDocument,
    }
  }
}
