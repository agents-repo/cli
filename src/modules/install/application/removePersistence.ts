import { LOCKFILE_VERSION } from '../../config/domain/configConstants.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { AgentsLockDocument } from '../../config/domain/agentsLock.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { RemovePackageFromConfig } from '../../config/application/removePackageFromConfig.js'

export class RemovePersistence {
  private readonly lockFileService = new LockFileService()
  private readonly removePackageFromConfig = new RemovePackageFromConfig()

  async remove(resolved: ResolvedAgentsConfig, packageId: string): Promise<void> {
    const existingLock = await this.lockFileService.read(resolved.lockPath)
    if (existingLock === null || !Object.hasOwn(existingLock.packages, packageId)) {
      return
    }

    await this.removePackageFromConfig.remove(resolved, packageId)

    const packages: AgentsLockDocument['packages'] = { ...existingLock.packages }
    delete packages[packageId]

    const lockDocument: AgentsLockDocument = {
      lockfileVersion: LOCKFILE_VERSION,
      resolvedRef: existingLock.resolvedRef,
      packages,
    }

    await this.lockFileService.write(resolved.lockPath, lockDocument)
  }
}
