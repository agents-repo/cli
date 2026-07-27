import { LOCKFILE_VERSION } from '../../config/domain/configConstants.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { AgentsLockDocument } from '../../config/domain/agentsLock.js'
import { ConfigMerger } from '../../config/application/configMerger.js'
import { GlobalInstallStateService } from '../../config/application/globalInstallStateService.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { resolveGlobalInstallStatePath } from '../../config/infrastructure/globalInstallStatePaths.js'
import { AgentsJsonRepository } from '../../config/infrastructure/agentsJsonRepository.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import type { ManifestArtifact } from '../../registry/domain/manifest.js'
import type { NormalizedPackageLockEntry } from '../../config/domain/packageLockEntry.js'
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

export interface GlobalInstallPersistenceInput {
  readonly env?: NodeJS.ProcessEnv
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly artifact: ManifestArtifact
  readonly resolvedRef: string
}

export interface GlobalBulkInstallPersistenceInput {
  readonly env?: NodeJS.ProcessEnv
  readonly resolvedRef: string
  readonly entries: readonly BulkInstallPersistenceEntry[]
}

export class InstallPersistence {
  private readonly configMerger = new ConfigMerger()
  private readonly agentsJsonRepository = new AgentsJsonRepository()
  private readonly lockFileService = new LockFileService()
  private readonly globalInstallStateService = new GlobalInstallStateService()

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
      adHocInstallPackageId: input.adHocInstall ? input.packageId : undefined,
      adHocInstallVersion: input.adHocInstall ? input.version : undefined,
      configTargetOverride:
        input.resolved.targets === undefined ? [input.target] : undefined,
    })
  }

  async saveGlobal(input: GlobalInstallPersistenceInput): Promise<void> {
    await this.saveGlobalBulk({
      env: input.env,
      resolvedRef: input.resolvedRef,
      entries: [
        {
          packageId: input.packageId,
          version: input.version,
          target: input.target,
          artifact: input.artifact,
        },
      ],
    })
  }

  async saveGlobalBulk(input: GlobalBulkInstallPersistenceInput): Promise<void> {
    assertResolvableLockRef(input.resolvedRef)

    const statePath = resolveGlobalInstallStatePath(input.env ?? process.env)
    const existing = await this.globalInstallStateService.read(statePath)
    const packages: Record<string, NormalizedPackageLockEntry> = { ...(existing?.packages ?? {}) }

    for (const entry of input.entries) {
      packages[entry.packageId] = this.globalInstallStateService.mergePackageEntry(
        packages[entry.packageId],
        entry.target,
        entry.version,
        this.lockFileService.formatIntegrity(entry.artifact.sha256),
        entry.artifact.file,
      )
    }

    await this.globalInstallStateService.upsertPackages(statePath, input.resolvedRef, Object.entries(packages).map(([packageId, entry]) => ({
      packageId,
      entry,
    })))
  }

  async saveBulk(
    input: BulkInstallPersistenceInput & {
      readonly adHocInstallPackageId?: string
      readonly adHocInstallVersion?: string
      readonly configTargetOverride?: InstallTargetId[]
    },
  ): Promise<void> {
    if (input.writeLock) {
      assertResolvableLockRef(input.resolvedRef)
      await this.lockFileService.read(input.resolved.lockPath)
    }

    const shouldWriteConfig =
      input.resolved.rawDocument === null ||
      input.resolved.targets === undefined ||
      input.adHocInstallPackageId !== undefined

    if (shouldWriteConfig) {
      const patch: {
        targets?: InstallTargetId[]
        registry?: ResolvedAgentsConfig['registry']
        packages?: Record<string, string>
      } = {}

      if (input.resolved.rawDocument === null) {
        patch.registry = input.resolved.registry
        if (input.configTargetOverride !== undefined) {
          patch.targets = input.configTargetOverride
        } else if (input.resolved.targets !== undefined) {
          patch.targets = input.resolved.targets
        }
        patch.packages = { ...input.resolved.packages }
        if (input.adHocInstallPackageId !== undefined && input.adHocInstallVersion !== undefined) {
          patch.packages[input.adHocInstallPackageId] = `^${input.adHocInstallVersion}`
        }
      } else if (input.adHocInstallPackageId !== undefined && input.adHocInstallVersion !== undefined) {
        patch.packages = { [input.adHocInstallPackageId]: `^${input.adHocInstallVersion}` }
      } else if (input.resolved.targets === undefined && input.configTargetOverride !== undefined) {
        patch.targets = input.configTargetOverride
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
    const packages: AgentsLockDocument['packages'] = { ...(existingLock?.packages ?? {}) }

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
