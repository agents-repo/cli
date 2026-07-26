import type { GlobalInstallStateDocument } from '../domain/agentsGlobalState.js'
import { GLOBAL_INSTALL_STATE_VERSION } from '../domain/configConstants.js'
import { LockValidationError } from '../domain/configErrors.js'
import type { PackageLockEntry } from '../domain/agentsLock.js'
import {
  isConcreteRegistryRef,
  isExactSemver,
  isQualifiedPackageId,
  isValidInstallTargetId,
  isValidLockIntegrity,
  isValidRfc3339Timestamp,
} from '../domain/validators.js'
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

  async upsertPackages(
    statePath: string,
    resolvedRef: string,
    entries: ReadonlyArray<{
      readonly packageId: string
      readonly entry: PackageLockEntry
    }>,
  ): Promise<void> {
    const existing = await this.read(statePath)
    const packages: Record<string, PackageLockEntry> = { ...(existing?.packages ?? {}) }

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
    if (stateVersion !== GLOBAL_INSTALL_STATE_VERSION) {
      throw new LockValidationError(
        `Unsupported stateVersion "${String(stateVersion)}"; expected ${GLOBAL_INSTALL_STATE_VERSION}`,
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

    const packages: Record<string, PackageLockEntry> = {}
    for (const [packageId, entry] of Object.entries(raw.packages)) {
      packages[packageId] = this.parsePackageEntry(packageId, entry)
    }

    return {
      stateVersion: GLOBAL_INSTALL_STATE_VERSION,
      resolvedRef: raw.resolvedRef,
      packages,
    }
  }

  private parsePackageEntry(packageId: string, entry: unknown): PackageLockEntry {
    if (!isQualifiedPackageId(packageId)) {
      throw new LockValidationError(`Invalid package id in global state file: ${packageId}`)
    }

    if (!isPlainObject(entry)) {
      throw new LockValidationError(`Global state entry for ${packageId} must be an object`)
    }

    if (typeof entry.version !== 'string' || !isExactSemver(entry.version)) {
      throw new LockValidationError(`Global state entry for ${packageId} has invalid version`)
    }

    if (typeof entry.target !== 'string' || !isValidInstallTargetId(entry.target)) {
      throw new LockValidationError(`Global state entry for ${packageId} has invalid target`)
    }

    if (typeof entry.integrity !== 'string' || !isValidLockIntegrity(entry.integrity)) {
      throw new LockValidationError(`Global state entry for ${packageId} has invalid integrity`)
    }

    if (typeof entry.artifact !== 'string' || entry.artifact.trim().length === 0) {
      throw new LockValidationError(`Global state entry for ${packageId} has invalid artifact`)
    }

    const result: PackageLockEntry = {
      version: entry.version,
      target: entry.target,
      integrity: entry.integrity,
      artifact: entry.artifact,
    }

    if (entry.resolved !== undefined) {
      if (typeof entry.resolved !== 'string' || !isValidRfc3339Timestamp(entry.resolved)) {
        throw new LockValidationError(
          `Global state entry for ${packageId} has invalid resolved timestamp`,
        )
      }
      return { ...result, resolved: entry.resolved }
    }

    return result
  }

  validate(document: GlobalInstallStateDocument): void {
    this.parseAndValidate({
      stateVersion: document.stateVersion,
      resolvedRef: document.resolvedRef,
      packages: document.packages,
    })
  }
}
