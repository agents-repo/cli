import { LOCKFILE_VERSION } from '../../config/domain/configConstants.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { AgentsLockDocument } from '../../config/domain/agentsLock.js'
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

export interface BulkInstallPersistenceEntry {
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly artifact: ManifestArtifact
}

export interface BulkInstallPersistenceInput {
  readonly resolved: ResolvedAgentsConfig
  readonly resolvedRef: string
  readonly entries: readonly BulkInstallPersistenceEntry[]
  readonly writeLock: boolean
}

const isGreenfieldConfigCreate = (resolved: ResolvedAgentsConfig): boolean => {
  if (resolved.gateMode !== 'greenfield') {
    return false
  }

  return resolved.rawDocument === null || Object.keys(resolved.rawDocument).length === 0
}

export class InstallPersistence {
  private readonly configMerger = new ConfigMerger()
  private readonly agentsJsonRepository = new AgentsJsonRepository()
  private readonly lockFileService = new LockFileService()

  async save(input: InstallPersistenceInput): Promise<void> {
    await this.saveBulk({
      resolved: input.resolved,
      resolvedRef: input.resolvedRef,
      entries: [
        {
          packageId: input.packageId,
          version: input.version,
          target: input.target,
          artifact: input.artifact,
        },
      ],
      writeLock: true,
      adHocPackageRanges: input.adHocInstall
        ? { [input.packageId]: `^${input.version}` }
        : undefined,
    })
  }

  async saveBulk(
    input: BulkInstallPersistenceInput & {
      readonly adHocPackageRanges?: Record<string, string>
    },
  ): Promise<void> {
    if (input.writeLock) {
      assertResolvableLockRef(input.resolvedRef)
      await this.lockFileService.read(input.resolved.lockPath)
    }

    const adHocRanges = input.adHocPackageRanges
    const hasAdHocRanges = adHocRanges !== undefined && Object.keys(adHocRanges).length > 0

    const shouldWriteConfig = isGreenfieldConfigCreate(input.resolved) || hasAdHocRanges

    if (shouldWriteConfig) {
      const patch: {
        targets?: InstallTargetId[]
        registry?: ResolvedAgentsConfig['registry']
        packages?: Record<string, string>
      } = {}

      if (isGreenfieldConfigCreate(input.resolved)) {
        patch.registry = input.resolved.registry
        if (input.resolved.targets !== undefined) {
          patch.targets = input.resolved.targets
        }
        const adHocPackageRanges =
          adHocRanges === undefined ? {} : { ...adHocRanges }
        patch.packages = { ...input.resolved.packages, ...adHocPackageRanges }
      } else if (hasAdHocRanges) {
        patch.packages = adHocRanges
      }

      const merged = this.configMerger.merge(input.resolved.rawDocument, patch, {
        gateMode: input.resolved.gateMode,
        force: true,
      })

      await this.agentsJsonRepository.write(input.resolved.configPath, merged)
    }

    if (!input.writeLock) {
      return
    }

    const existingLock = await this.lockFileService.read(input.resolved.lockPath)
    const packages: AgentsLockDocument['packages'] = existingLock?.packages
      ? { ...existingLock.packages }
      : {}

    for (const entry of input.entries) {
      const prior = packages[entry.packageId]
      packages[entry.packageId] = this.lockFileService.mergePackageEntry(
        prior,
        entry.target,
        entry.version,
        this.lockFileService.formatIntegrity(entry.artifact.sha256),
        entry.artifact.file,
      )
    }

    const lockDocument: AgentsLockDocument = {
      lockfileVersion: LOCKFILE_VERSION,
      resolvedRef: input.resolvedRef,
      packages,
    }

    await this.lockFileService.write(input.resolved.lockPath, lockDocument)
  }
}
