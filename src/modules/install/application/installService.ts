import { BulkInstallService } from './bulkInstallService.js'
import type { InstallResult } from '../domain/installResult.js'
import type { InstallSelection } from '../domain/installSelection.js'

export interface InstallServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly packageId: string
  readonly selection?: InstallSelection
  readonly global?: boolean
  readonly yes?: boolean
  readonly dryRun?: boolean
  readonly noSave?: boolean
}

export class InstallService {
  private readonly bulkInstallService = new BulkInstallService()

  async run(options: InstallServiceOptions): Promise<InstallResult[]> {
    return this.bulkInstallService.runAll({
      cwd: options.cwd,
      env: options.env,
      packageId: options.packageId,
      selection: options.selection,
      global: options.global,
      yes: options.yes,
      dryRun: options.dryRun,
      noSave: options.noSave,
      enforceConfiguredOnly: false,
    })
  }
}
