import {
  LOCKFILE_VERSION,
  SUPPORTED_LOCKFILE_VERSIONS,
} from '../domain/configConstants.js'
import type { AgentsLockDocument } from '../domain/agentsLock.js'
import { LockValidationError } from '../domain/configErrors.js'
import {
  mergeTargetLockSlot,
  type NormalizedPackageLockEntry,
  parsePackageLockEntry,
  serializePackageLockEntryV2,
} from '../domain/packageLockEntry.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import {
  isConcreteRegistryRef,
  isManifestSha256Hex,
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

    return this.parseAndValidate(raw)
  }

  async write(lockPath: string, document: AgentsLockDocument): Promise<void> {
    this.validate(document)
    await this.agentsLockRepository.write(lockPath, document)
  }

  formatIntegrity(manifestSha256Hex: string): string {
    if (!isManifestSha256Hex(manifestSha256Hex)) {
      throw new LockValidationError('Manifest SHA-256 must be a 64-character lowercase hex string')
    }

    return `sha256-${manifestSha256Hex}`
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

  private parseAndValidate(raw: Record<string, unknown>): AgentsLockDocument {
    const lockfileVersion = raw.lockfileVersion
    if (
      typeof lockfileVersion !== 'number' ||
      !SUPPORTED_LOCKFILE_VERSIONS.includes(
        lockfileVersion as (typeof SUPPORTED_LOCKFILE_VERSIONS)[number],
      )
    ) {
      throw new LockValidationError(
        `Unsupported lockfileVersion "${String(lockfileVersion)}"; expected ${SUPPORTED_LOCKFILE_VERSIONS.join(' or ')}`,
      )
    }

    if (typeof raw.resolvedRef !== 'string' || !isConcreteRegistryRef(raw.resolvedRef)) {
      throw new LockValidationError(
        'agents-lock.json resolvedRef must be a concrete registry git ref without surrounding whitespace',
      )
    }

    if (!isPlainObject(raw.packages)) {
      throw new LockValidationError('agents-lock.json packages must be an object')
    }

    const packages: Record<string, NormalizedPackageLockEntry> = {}
    for (const [packageId, entry] of Object.entries(raw.packages)) {
      packages[packageId] = parsePackageLockEntry(packageId, entry, lockfileVersion)
    }

    return {
      lockfileVersion: LOCKFILE_VERSION,
      resolvedRef: raw.resolvedRef,
      packages,
    }
  }

  validate(document: AgentsLockDocument): void {
    if (document.lockfileVersion !== LOCKFILE_VERSION) {
      throw new LockValidationError(`lockfileVersion must be ${LOCKFILE_VERSION} on write`)
    }

    const packages: Record<string, unknown> = {}
    for (const [packageId, entry] of Object.entries(document.packages)) {
      packages[packageId] = serializePackageLockEntryV2(entry)
    }

    this.parseAndValidate({
      lockfileVersion: LOCKFILE_VERSION,
      resolvedRef: document.resolvedRef,
      packages,
    })
  }
}
