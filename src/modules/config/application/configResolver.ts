import { DEFAULT_REGISTRY_CONFIG } from '../../registry/infrastructure/registrySourceConfig.js'
import { ENV_AGENTS_REPO_REGISTRY_URL } from '../domain/configConstants.js'
import type { ResolvedAgentsConfig } from '../domain/agentsConfig.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import { AgentsJsonRepository } from '../infrastructure/agentsJsonRepository.js'
import { resolveConfigPaths } from '../infrastructure/configPaths.js'
import { extractCliManagedConfig } from './cliManagedSlice.js'
import { ConflictDetector } from './conflictDetector.js'
import { SchemaGate, getActiveGateTarget } from './schemaGate.js'

export interface ConfigResolverOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly waiveConflicts?: boolean
  readonly requireTarget?: boolean
}

export class ConfigResolver {
  private readonly schemaGate = new SchemaGate()
  private readonly conflictDetector = new ConflictDetector()
  private readonly agentsJsonRepository = new AgentsJsonRepository()

  async resolve(options: ConfigResolverOptions = {}): Promise<ResolvedAgentsConfig> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const { configPath, lockPath } = resolveConfigPaths(cwd, env)

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
    }

    const packages = managed.packages ?? {}
    const global = managed.global ?? false

    if (options.requireTarget && managed.target === undefined) {
      throw new ConfigValidationError('Install target is required but missing from config', 'missing_target')
    }

    return {
      gateMode,
      configPath,
      lockPath,
      schemaVersion: managed.schemaVersion,
      registry,
      target: managed.target,
      packages,
      global,
      warnings,
      rawDocument,
    }
  }
}
