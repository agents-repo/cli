import { ConfigResolver } from '../../config/application/configResolver.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { loadRegistryCatalog } from '../../registry/infrastructure/registryRepository.js'
import { loadProjectInstallPrerequisites } from './projectInstallPrerequisites.js'
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
    const { resolved, warnings, scope, lock, targets, packageIds } =
      await loadProjectInstallPrerequisites(
        {
          configResolver: this.configResolver,
          lockFileService: this.lockFileService,
        },
        {
          cwd: options.cwd,
          env: options.env,
          yes: options.yes,
          force: false,
        },
      )

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
