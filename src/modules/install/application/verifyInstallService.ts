import { ConfigResolver } from '../../config/application/configResolver.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { LockValidationError } from '../../config/domain/configErrors.js'
import { loadRegistryCatalog } from '../../registry/infrastructure/registryRepository.js'
import { resolveInstallScope } from './installScope.js'
import { resolveInstallTargets } from './resolveInstallTargets.js'
import {
  validateCiConfigLockPackageSets,
  validateCiRequiredByTargetSlots,
} from './validateCiPrerequisites.js'
import { validateLockVersionRanges } from './validateLockVersionRanges.js'
import { assertInstallSurfacesExist } from './verifyInstallSurface.js'

export interface VerifyInstallServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly yes?: boolean
  readonly online?: boolean
}

export interface VerifyInstallServiceResult {
  readonly warnings: readonly string[]
}

export class VerifyInstallService {
  private readonly configResolver = new ConfigResolver()
  private readonly lockFileService = new LockFileService()

  async run(options: VerifyInstallServiceOptions = {}): Promise<VerifyInstallServiceResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env

    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      globalScope: false,
      waiveConflicts: options.yes ?? false,
    })

    const warnings = resolved.warnings.map((warning) => warning.message)
    const scope = resolveInstallScope({ cwd, env, globalFlag: false })

    const lock = await this.lockFileService.read(resolved.lockPath)
    if (lock === null) {
      throw new LockValidationError('agents-lock.json is missing')
    }

    validateCiConfigLockPackageSets(resolved, lock)

    const targets = resolveInstallTargets(resolved)
    const packageIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))

    validateCiRequiredByTargetSlots(lock, packageIds, targets)
    validateLockVersionRanges(resolved, lock, { force: false })

    if (options.online === true) {
      const catalogResult = await loadRegistryCatalog({
        ...resolved.registry,
        ref: lock.resolvedRef,
      })
      warnings.push(...catalogResult.warnings)
    }

    assertInstallSurfacesExist({
      extractRoot: scope.extractRoot,
      packageIds,
      targets,
      lock,
    })

    return { warnings }
  }
}
