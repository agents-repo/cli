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

export const resolveInstallContext = async (options: {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly targetOverride?: string
  readonly globalFlag?: boolean
  readonly yes?: boolean
}): Promise<ResolvedInstallContext> => {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const warnings: string[] = []

  const resolved = await new ConfigResolver().resolve({
    cwd,
    env,
    waiveConflicts: options.yes ?? false,
  })

  warnings.push(...resolved.warnings.map((warning) => warning.message))

  const effectiveTargetInput = options.targetOverride ?? resolved.target
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
    cwd,
    env,
    globalFlag: options.globalFlag,
    configGlobal: resolved.global,
  })

  const catalogResult = await loadRegistryCatalog(resolved.registry)
  warnings.push(...catalogResult.warnings)

  return {
    cwd,
    env,
    resolved,
    target,
    scope,
    warnings,
    catalogResult,
  }
}
