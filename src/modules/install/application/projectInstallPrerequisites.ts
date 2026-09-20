import { ConfigResolver } from '../../config/application/configResolver.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { AgentsLockDocument } from '../../config/domain/agentsLock.js'
import { LockValidationError } from '../../config/domain/configErrors.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { resolveInstallScope, type InstallScope } from './installScope.js'
import { resolveInstallTargets } from './resolveInstallTargets.js'
import {
  validateCiConfigLockPackageSets,
  validateCiRequiredByTargetSlots,
} from './validateCiPrerequisites.js'
import { validateLockVersionRanges } from './validateLockVersionRanges.js'

export interface ProjectInstallPrerequisites {
  readonly resolved: ResolvedAgentsConfig
  readonly warnings: string[]
  readonly scope: InstallScope
  readonly lock: AgentsLockDocument
  readonly targets: readonly InstallTargetId[]
  readonly packageIds: readonly string[]
}

export interface LoadProjectInstallPrerequisitesOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly yes?: boolean
  readonly force?: boolean
}

export const loadProjectInstallPrerequisites = async (
  deps: {
    readonly configResolver: ConfigResolver
    readonly lockFileService: LockFileService
  },
  options: LoadProjectInstallPrerequisitesOptions = {},
): Promise<ProjectInstallPrerequisites> => {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const force = options.force === true

  const resolved = await deps.configResolver.resolve({
    cwd,
    env,
    globalScope: false,
    waiveConflicts: options.yes ?? false,
  })

  const warnings = resolved.warnings.map((warning) => warning.message)
  const scope = resolveInstallScope({ cwd, env, globalFlag: false })

  const lock = await deps.lockFileService.read(resolved.lockPath)
  if (lock === null) {
    throw new LockValidationError('agents-lock.json is missing')
  }

  validateCiConfigLockPackageSets(resolved, lock)

  const targets = resolveInstallTargets(resolved)
  const packageIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))

  validateCiRequiredByTargetSlots(lock, packageIds, targets)
  validateLockVersionRanges(resolved, lock, { force })

  return { resolved, warnings, scope, lock, targets, packageIds }
}
