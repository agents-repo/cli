import {
  GLOBAL_INSTALL_STATE_VERSION,
  SUPPORTED_LOCKFILE_VERSIONS,
} from '../domain/configConstants.js'
import type { GlobalInstallStateDocument } from '../domain/agentsGlobalState.js'
import { LockValidationError } from '../domain/configErrors.js'
import type { NormalizedPackageLockEntry } from '../domain/packageLockEntry.js'
import {
  mergeTargetLockSlot,
  parsePackageLockEntry,
  serializePackageLockEntryV2,
} from '../domain/packageLockEntry.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { isConcreteRegistryRef } from '../domain/validators.js'
import { GlobalInstallStateRepository } from '../infrastructure/globalInstallStateRepository.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'

export class GlobalInstallStateService {
  private readonly repository = new GlobalInstallStateRepository()

  async read(statePath: string): Promise<GlobalInstallStateDocument | null> {
    const raw = await this.repository.readRaw(statePath)
    if (raw === null) {
      return null
    }

    return this.parseAndValidate(raw)
  }

  async write(statePath: string, document: GlobalInstallStateDocument): Promise<void> {
    this.validate(document)
    await this.repository.write(statePath, document)
  }

  mergePackageEntry(
    existing: NormalizedPackageLockEntry | undefined,
    targetId: InstallTargetId,
    version: string,
    integrity: string,
    artifact: string,
  ): NormalizedPackageLockEntry {
    return mergeTargetLockSlot(existing, targetId, version, { integrity, artifact })
  }

  async upsertPackages(
    statePath: string,
    resolvedRef: string,
    entries: ReadonlyArray<{
      readonly packageId: string
      readonly entry: NormalizedPackageLockEntry
    }>,
  ): Promise<void> {
    const existing = await this.read(statePath)
    const packages: Record<string, NormalizedPackageLockEntry> = { ...(existing?.packages ?? {}) }

    for (const { packageId, entry } of entries) {
      packages[packageId] = entry
    }

    await this.write(statePath, {
      stateVersion: GLOBAL_INSTALL_STATE_VERSION,
      resolvedRef,
      packages,
    })
  }

  private parseAndValidate(raw: Record<string, unknown>): GlobalInstallStateDocument {
    const stateVersion = raw.stateVersion
    if (
      typeof stateVersion !== 'number' ||
      !SUPPORTED_LOCKFILE_VERSIONS.includes(
        stateVersion as (typeof SUPPORTED_LOCKFILE_VERSIONS)[number],
      )
    ) {
      throw new LockValidationError(
        `Unsupported stateVersion "${String(stateVersion)}"; expected ${SUPPORTED_LOCKFILE_VERSIONS.join(' or ')}`,
      )
    }

    if (typeof raw.resolvedRef !== 'string' || !isConcreteRegistryRef(raw.resolvedRef)) {
      throw new LockValidationError(
        'agents-global.json resolvedRef must be a concrete registry git ref without surrounding whitespace',
      )
    }

    if (!isPlainObject(raw.packages)) {
      throw new LockValidationError('agents-global.json packages must be an object')
    }

    const packages: Record<string, NormalizedPackageLockEntry> = {}
    for (const [packageId, entry] of Object.entries(raw.packages)) {
      packages[packageId] = parsePackageLockEntry(packageId, entry, stateVersion)
    }

    return {
      stateVersion: GLOBAL_INSTALL_STATE_VERSION,
      resolvedRef: raw.resolvedRef,
      packages,
    }
  }

  validate(document: GlobalInstallStateDocument): void {
    const packages: Record<string, unknown> = {}
    for (const [packageId, entry] of Object.entries(document.packages)) {
      packages[packageId] = serializePackageLockEntryV2(entry)
    }

    this.parseAndValidate({
      stateVersion: GLOBAL_INSTALL_STATE_VERSION,
      resolvedRef: document.resolvedRef,
      packages,
    })
  }
}
