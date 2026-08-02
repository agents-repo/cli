import { BulkInstallService } from './bulkInstallService.js'
import type { InstallResult } from '../domain/installResult.js'

export interface InstallServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly packageIds: readonly string[]
  readonly global?: boolean
  readonly yes?: boolean
  readonly dryRun?: boolean
  readonly noSave?: boolean
  readonly preferOnline?: boolean
}

export class InstallService {
  private readonly bulkInstallService = new BulkInstallService()

  async run(options: InstallServiceOptions): Promise<InstallResult[]> {
    return this.bulkInstallService.runAll({
      cwd: options.cwd,
      env: options.env,
      packageIds: options.packageIds,
      global: options.global,
      yes: options.yes,
      dryRun: options.dryRun,
      noSave: options.noSave,
      preferOnline: options.preferOnline,
      enforceConfiguredOnly: false,
    })
  }
}
