import type { AgentsLockDocument } from '../domain/agentsLock.js'
import type { ResolvedAgentsConfig } from '../domain/agentsConfig.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import { planFrozenInstallSlot } from '../../install/application/planFrozenInstallSlot.js'
import { downloadArtifact } from '../../install/infrastructure/artifactDownloader.js'
import { listMappedZipFileEntries } from '../../install/infrastructure/artifactExtractPaths.js'
import { isLegacyRelativePath } from '../../install/domain/pathEncoding.js'
import { resolveInstallTargets } from '../../install/application/resolveInstallTargets.js'

export class DoctorLegacyPathEncodingError extends Error {
  readonly code = 'legacy_path_encoding'
  readonly exitCode = 3 as const

  constructor(message: string) {
    super(message)
    this.name = 'DoctorLegacyPathEncodingError'
  }
}

export class DoctorAgentPathCollisionError extends Error {
  readonly code = 'agent_path_collision'
  readonly exitCode = 3 as const

  constructor(message: string) {
    super(message)
    this.name = 'DoctorAgentPathCollisionError'
  }
}

export interface LockSlotArtifact {
  readonly packageId: string
  readonly target: InstallTargetId
  readonly version: string
  readonly zipBytes: Buffer
  readonly mappedPaths: readonly string[]
}

export type DoctorPathCheckOptions = {
  readonly resolved: ResolvedAgentsConfig
  readonly lock: AgentsLockDocument
  readonly catalogResult: RegistryCatalogLoadResult
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly preferOnline: boolean
  readonly parseIntegrityHex: (integrity: string) => string
}

const sortedPackageIds = (resolved: ResolvedAgentsConfig): string[] =>
  Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))

export const loadLockSlotArtifacts = async (
  options: DoctorPathCheckOptions,
): Promise<LockSlotArtifact[]> => {
  const targets = resolveInstallTargets(options.resolved)
  const packageIds = sortedPackageIds(options.resolved)
  const artifacts: LockSlotArtifact[] = []

  for (const packageId of packageIds) {
    if (!Object.hasOwn(options.lock.packages, packageId)) {
      continue
    }

    const lockEntry = options.lock.packages[packageId]

    for (const target of targets) {
      const slot = lockEntry.byTarget[target]
      if (slot === undefined) {
        continue
      }

      const pkg = resolvePackageInCatalog(options.catalogResult.catalog, packageId)
      const plan = planFrozenInstallSlot({
        catalogResult: options.catalogResult,
        pkg,
        version: lockEntry.version,
        target,
        slot,
      })

      const zipBytes = await downloadArtifact(plan.artifactUrl, {
        expectedSha256Hex: options.parseIntegrityHex(plan.slot.integrity),
        preferOnline: options.preferOnline,
        env: options.env,
      })
      const mappedPaths = listMappedZipFileEntries(zipBytes, plan.target, plan.version)

      artifacts.push({
        packageId,
        target,
        version: lockEntry.version,
        zipBytes,
        mappedPaths,
      })
    }
  }

  return artifacts
}

const formatPreviewList = (items: string[], maxItems = 5): string => {
  const preview = items.slice(0, maxItems).join(', ')
  const suffix = items.length > maxItems ? ` (+${items.length - maxItems} more)` : ''
  return `${preview}${suffix}`
}

const packageUsesLegacyPaths = (
  artifacts: readonly LockSlotArtifact[],
  packageId: string,
): boolean =>
  artifacts
    .filter((artifact) => artifact.packageId === packageId)
    .some((artifact) => artifact.mappedPaths.some((relativePath) => isLegacyRelativePath(relativePath)))

export const verifyLegacyPathEncoding = (
  lock: AgentsLockDocument,
  artifacts: readonly LockSlotArtifact[],
): void => {
  const legacyPackages: string[] = []

  const packageIds = Object.keys(lock.packages).sort((left, right) => left.localeCompare(right))

  for (const packageId of packageIds) {
    if (!Object.hasOwn(lock.packages, packageId)) {
      continue
    }

    const lockEntry = lock.packages[packageId]
    if (lockEntry.pathEncodingVersion !== undefined) {
      continue
    }

    if (packageUsesLegacyPaths(artifacts, packageId)) {
      legacyPackages.push(packageId)
    }
  }

  if (legacyPackages.length > 0) {
    throw new DoctorLegacyPathEncodingError(
      `Package(s) use legacy flat install paths without pathEncodingVersion: ${formatPreviewList(legacyPackages)}. Run install or update after registry artifacts are republished.`,
    )
  }
}

export const verifyAgentPathCollisions = (artifacts: readonly LockSlotArtifact[]): void => {
  const pathsByRelativePath = new Map<string, Set<string>>()

  for (const artifact of artifacts) {
    for (const relativePath of artifact.mappedPaths) {
      const owners = pathsByRelativePath.get(relativePath) ?? new Set<string>()
      owners.add(artifact.packageId)
      pathsByRelativePath.set(relativePath, owners)
    }
  }

  const collisions: string[] = []

  for (const [relativePath, owners] of pathsByRelativePath.entries()) {
    if (owners.size < 2) {
      continue
    }

    collisions.push(
      `${relativePath} (${[...owners].sort((left, right) => left.localeCompare(right)).join(', ')})`,
    )
  }

  if (collisions.length > 0) {
    const preview = collisions.slice(0, 5).join('; ')
    const suffix = collisions.length > 5 ? ` (+${collisions.length - 5} more)` : ''
    throw new DoctorAgentPathCollisionError(
      `Cross-package install path collision(s): ${preview}${suffix}`,
    )
  }
}
