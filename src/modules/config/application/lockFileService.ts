import { LOCKFILE_VERSION } from '../domain/configConstants.js'
import type { AgentsLockDocument, PackageLockEntry } from '../domain/agentsLock.js'
import { LockValidationError } from '../domain/configErrors.js'
import {
  isExactSemver,
  isQualifiedPackageId,
  isValidInstallTargetId,
  isValidLockIntegrity,
} from '../domain/validators.js'
import { AgentsLockRepository } from '../infrastructure/agentsLockRepository.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'

export class LockFileService {
  private readonly agentsLockRepository = new AgentsLockRepository()

  async read(lockPath: string): Promise<AgentsLockDocument | null> {
    const raw = await this.agentsLockRepository.readRaw(lockPath)
    if (raw === null) {
      return null
    }

    const document = this.parseAndValidate(raw)
    return document
  }

  async write(lockPath: string, document: AgentsLockDocument): Promise<void> {
    this.validate(document)
    await this.agentsLockRepository.write(lockPath, document)
  }

  formatIntegrity(manifestSha256Hex: string): string {
    return `sha256-${manifestSha256Hex}`
  }

  private parseAndValidate(raw: Record<string, unknown>): AgentsLockDocument {
    const lockfileVersion = raw.lockfileVersion
    if (lockfileVersion !== LOCKFILE_VERSION) {
      throw new LockValidationError(
        `Unsupported lockfileVersion "${String(lockfileVersion)}"; expected ${LOCKFILE_VERSION}`,
      )
    }

    if (typeof raw.resolvedRef !== 'string' || raw.resolvedRef.trim().length === 0) {
      throw new LockValidationError('agents-lock.json resolvedRef must be a non-empty string')
    }

    if (!isPlainObject(raw.packages)) {
      throw new LockValidationError('agents-lock.json packages must be an object')
    }

    const packages: Record<string, PackageLockEntry> = {}
    for (const [packageId, entry] of Object.entries(raw.packages)) {
      packages[packageId] = this.parsePackageEntry(packageId, entry)
    }

    return {
      lockfileVersion: LOCKFILE_VERSION,
      resolvedRef: raw.resolvedRef,
      packages,
    }
  }

  private parsePackageEntry(packageId: string, entry: unknown): PackageLockEntry {
    if (!isQualifiedPackageId(packageId)) {
      throw new LockValidationError(`Invalid package id in lock file: ${packageId}`)
    }

    if (!isPlainObject(entry)) {
      throw new LockValidationError(`Lock entry for ${packageId} must be an object`)
    }

    if (typeof entry.version !== 'string' || !isExactSemver(entry.version)) {
      throw new LockValidationError(`Lock entry for ${packageId} has invalid version`)
    }

    if (typeof entry.target !== 'string' || !isValidInstallTargetId(entry.target)) {
      throw new LockValidationError(`Lock entry for ${packageId} has invalid target`)
    }

    if (typeof entry.integrity !== 'string' || !isValidLockIntegrity(entry.integrity)) {
      throw new LockValidationError(`Lock entry for ${packageId} has invalid integrity`)
    }

    if (typeof entry.artifact !== 'string' || entry.artifact.trim().length === 0) {
      throw new LockValidationError(`Lock entry for ${packageId} has invalid artifact`)
    }

    const result: PackageLockEntry = {
      version: entry.version,
      target: entry.target,
      integrity: entry.integrity,
      artifact: entry.artifact,
    }

    if (entry.resolved !== undefined) {
      if (typeof entry.resolved !== 'string') {
        throw new LockValidationError(`Lock entry for ${packageId} has invalid resolved timestamp`)
      }
      return { ...result, resolved: entry.resolved }
    }

    return result
  }

  validate(document: AgentsLockDocument): void {
    this.parseAndValidate({
      lockfileVersion: document.lockfileVersion,
      resolvedRef: document.resolvedRef,
      packages: document.packages,
    })
  }
}
