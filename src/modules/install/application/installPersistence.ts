import { LOCKFILE_VERSION } from '../../config/domain/configConstants.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { AgentsLockDocument, PackageLockEntry } from '../../config/domain/agentsLock.js'
import { ConfigMerger } from '../../config/application/configMerger.js'
import { GlobalInstallStateService } from '../../config/application/globalInstallStateService.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { resolveGlobalInstallStatePath } from '../../config/infrastructure/globalInstallStatePaths.js'
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

  async saveGlobal(input: GlobalInstallPersistenceInput): Promise<void> {
    assertResolvableLockRef(input.resolvedRef)

    const statePath = resolveGlobalInstallStatePath(input.env ?? process.env)
    const lockEntry: PackageLockEntry = {
      version: input.version,
      target: input.target,
      integrity: this.lockFileService.formatIntegrity(input.artifact.sha256),
      artifact: input.artifact.file,
    }

    await this.globalInstallStateService.upsertPackages(statePath, input.resolvedRef, [
      { packageId: input.packageId, entry: lockEntry },
    ])
  }

  async saveGlobalBulk(input: GlobalBulkInstallPersistenceInput): Promise<void> {
    assertResolvableLockRef(input.resolvedRef)

    const statePath = resolveGlobalInstallStatePath(input.env ?? process.env)
    const entries = input.entries.map((entry) => ({
      packageId: entry.packageId,
      entry: {
        version: entry.version,
        target: entry.target,
        integrity: this.lockFileService.formatIntegrity(entry.artifact.sha256),
        artifact: entry.artifact.file,
      } satisfies PackageLockEntry,
    }))

    await this.globalInstallStateService.upsertPackages(statePath, input.resolvedRef, entries)
  }

  async saveBulk(input: BulkInstallPersistenceInput): Promise<void> {
    const targetFromEntries = input.entries[0]?.target
    const hasTargetFromEntries = input.entries.length > 0
    const shouldWriteConfig =
      input.resolved.rawDocument === null ||
      (input.resolved.target === undefined && hasTargetFromEntries)

    if (shouldWriteConfig) {
      const patch: {
        target?: InstallTargetId
        registry?: ResolvedAgentsConfig['registry']
        packages?: Record<string, string>
      } = {}

      if (input.resolved.rawDocument === null) {
        patch.registry = input.resolved.registry
        patch.target = input.resolved.target ?? targetFromEntries
        patch.packages = input.resolved.packages
      } else if (input.resolved.target === undefined && hasTargetFromEntries) {
        patch.target = targetFromEntries
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

    assertResolvableLockRef(input.resolvedRef)

    const existingLock = await this.lockFileService.read(input.resolved.lockPath)
    const packages: AgentsLockDocument['packages'] = { ...(existingLock?.packages ?? {}) }

    for (const entry of input.entries) {
      packages[entry.packageId] = {
        version: entry.version,
        target: entry.target,
        integrity: this.lockFileService.formatIntegrity(entry.artifact.sha256),
        artifact: entry.artifact.file,
      }
    }

    const lockDocument: AgentsLockDocument = {
      lockfileVersion: LOCKFILE_VERSION,
      resolvedRef: input.resolvedRef,
      packages,
    }

    await this.lockFileService.write(input.resolved.lockPath, lockDocument)
  }
}
