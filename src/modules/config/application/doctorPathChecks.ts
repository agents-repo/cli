import type { AgentsLockDocument } from '../domain/agentsLock.js'
import type { ResolvedAgentsConfig } from '../domain/agentsConfig.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import { planFrozenInstallSlot } from '../../install/application/planFrozenInstallSlot.js'
import { downloadArtifact } from '../../install/infrastructure/artifactDownloader.js'
import { listMappedZipFileEntries } from '../../install/infrastructure/artifactExtractPaths.js'
import { isLegacySkillRelativePath } from '../../install/domain/pathEncoding.js'
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

const collectMappedPathsForLock = async (options: {
  readonly resolved: ResolvedAgentsConfig
  readonly lock: AgentsLockDocument
  readonly catalogResult: RegistryCatalogLoadResult
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly preferOnline: boolean
  readonly parseIntegrityHex: (integrity: string) => string
}): Promise<Map<string, Set<string>>> => {
  const targets = resolveInstallTargets(options.resolved)
  const packageIds = Object.keys(options.resolved.packages).sort((left, right) =>
    left.localeCompare(right),
  )
  const pathsByRelativePath = new Map<string, Set<string>>()

  for (const target of targets) {
    for (const packageId of packageIds) {
      if (!Object.hasOwn(options.lock.packages, packageId)) {
        continue
      }

      const lockEntry = options.lock.packages[packageId]
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

      for (const relativePath of mappedPaths) {
        const owners = pathsByRelativePath.get(relativePath) ?? new Set<string>()
        owners.add(packageId)
        pathsByRelativePath.set(relativePath, owners)
      }
    }
  }

  return pathsByRelativePath
}

export const verifyLegacyPathEncoding = async (options: {
  readonly resolved: ResolvedAgentsConfig
  readonly lock: AgentsLockDocument
  readonly catalogResult: RegistryCatalogLoadResult
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly preferOnline: boolean
  readonly parseIntegrityHex: (integrity: string) => string
}): Promise<void> => {
  const targets = resolveInstallTargets(options.resolved)
  const packageIds = Object.keys(options.resolved.packages).sort((left, right) =>
    left.localeCompare(right),
  )
  const legacyPackages: string[] = []

  for (const packageId of packageIds) {
    if (!Object.hasOwn(options.lock.packages, packageId)) {
      continue
    }

    const lockEntry = options.lock.packages[packageId]
    if (lockEntry.pathEncodingVersion !== undefined) {
      continue
    }

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
      const hasLegacySkillPath = mappedPaths.some((relativePath) =>
        isLegacySkillRelativePath(relativePath),
      )

      if (hasLegacySkillPath) {
        legacyPackages.push(packageId)
        break
      }
    }
  }

  if (legacyPackages.length > 0) {
    const preview = legacyPackages.slice(0, 5).join(', ')
    const suffix = legacyPackages.length > 5 ? ` (+${legacyPackages.length - 5} more)` : ''
    throw new DoctorLegacyPathEncodingError(
      `Package(s) use legacy flat install paths without pathEncodingVersion: ${preview}${suffix}. Run install or update after registry artifacts are republished.`,
    )
  }
}

export const verifyAgentPathCollisions = async (options: {
  readonly resolved: ResolvedAgentsConfig
  readonly lock: AgentsLockDocument
  readonly catalogResult: RegistryCatalogLoadResult
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly preferOnline: boolean
  readonly parseIntegrityHex: (integrity: string) => string
}): Promise<void> => {
  const pathsByRelativePath = await collectMappedPathsForLock(options)
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
