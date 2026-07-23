import { LOCKFILE_VERSION } from '../../config/domain/configConstants.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { AgentsLockDocument, PackageLockEntry } from '../../config/domain/agentsLock.js'
import { ConfigMerger } from '../../config/application/configMerger.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { AgentsJsonRepository } from '../../config/infrastructure/agentsJsonRepository.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import type { ManifestArtifact } from '../../registry/domain/manifest.js'
import { assertResolvableLockRef } from './resolveLockRef.js'

export interface InstallPersistenceInput {
  readonly resolved: ResolvedAgentsConfig
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly artifact: ManifestArtifact
  readonly resolvedRef: string
  readonly adHocInstall: boolean
}

export class InstallPersistence {
  private readonly configMerger = new ConfigMerger()
  private readonly agentsJsonRepository = new AgentsJsonRepository()
  private readonly lockFileService = new LockFileService()

  async save(input: InstallPersistenceInput): Promise<void> {
    assertResolvableLockRef(input.resolvedRef)

    const patch: {
      target?: InstallTargetId
      registry?: ResolvedAgentsConfig['registry']
      packages?: Record<string, string>
    } = {}

    if (input.adHocInstall) {
      patch.packages = { [input.packageId]: `^${input.version}` }
    }

    if (input.resolved.rawDocument === null) {
      patch.registry = input.resolved.registry
      patch.target = input.target
      if (patch.packages === undefined) {
        patch.packages = { [input.packageId]: `^${input.version}` }
      }
    } else if (input.resolved.target === undefined) {
      patch.target = input.target
    }

    const merged = this.configMerger.merge(input.resolved.rawDocument, patch, {
      gateMode: input.resolved.gateMode,
      force: true,
    })

    const existingLock = await this.lockFileService.read(input.resolved.lockPath)
    const lockEntry: PackageLockEntry = {
      version: input.version,
      target: input.target,
      integrity: this.lockFileService.formatIntegrity(input.artifact.sha256),
      artifact: input.artifact.file,
    }

    const lockDocument: AgentsLockDocument = {
      lockfileVersion: LOCKFILE_VERSION,
      resolvedRef: input.resolvedRef,
      packages: {
        ...(existingLock?.packages ?? {}),
        [input.packageId]: lockEntry,
      },
    }

    await this.agentsJsonRepository.write(input.resolved.configPath, merged)
    await this.lockFileService.write(input.resolved.lockPath, lockDocument)
  }
}
