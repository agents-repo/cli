import { ConfigResolver } from '../../config/application/configResolver.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { isValidInstallTargetId } from '../../config/domain/validators.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { loadRegistryCatalog } from '../../registry/infrastructure/registryRepository.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import { resolveInstallScope, type InstallScope } from './installScope.js'

export interface ResolvedInstallContext {
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly resolved: ResolvedAgentsConfig
  readonly target: InstallTargetId
  readonly scope: InstallScope
  readonly warnings: string[]
  readonly catalogResult: RegistryCatalogLoadResult
}

export const buildInstallContext = async (options: {
  readonly resolved: ResolvedAgentsConfig
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly targetOverride?: string
  readonly globalFlag?: boolean
}): Promise<ResolvedInstallContext> => {
  const warnings = options.resolved.warnings.map((warning) => warning.message)

  const effectiveTargetInput = options.targetOverride ?? options.resolved.target
  if (effectiveTargetInput === undefined) {
    throw new ConfigValidationError('Install target is required but missing from config', 'missing_target')
  }

  if (!isValidInstallTargetId(effectiveTargetInput)) {
    throw new ConfigValidationError(
      `Invalid install target id: ${effectiveTargetInput}`,
      'invalid_enum',
    )
  }

  const target = effectiveTargetInput
  const scope = resolveInstallScope({
    cwd: options.cwd,
    env: options.env,
    globalFlag: options.globalFlag,
    configGlobal: options.resolved.global,
  })

  const catalogResult = await loadRegistryCatalog(options.resolved.registry)
  warnings.push(...catalogResult.warnings)

  return {
    cwd: options.cwd,
    env: options.env,
    resolved: options.resolved,
    target,
    scope,
    warnings,
    catalogResult,
  }
}

export const resolveInstallContext = async (options: {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly targetOverride?: string
  readonly globalFlag?: boolean
  readonly yes?: boolean
}): Promise<ResolvedInstallContext> => {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env

  const resolved = await new ConfigResolver().resolve({
    cwd,
    env,
    waiveConflicts: options.yes ?? false,
  })

  return buildInstallContext({
    resolved,
    cwd,
    env,
    targetOverride: options.targetOverride,
    globalFlag: options.globalFlag,
  })
}
