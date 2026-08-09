import { ConfigResolver } from '../../config/application/configResolver.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { resolveAgentsRepoHome } from '../../config/infrastructure/agentsRepoHome.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import { resolvePackageRef } from '../../registry/domain/package.js'
import { detectGreenfieldInstallTargets } from '../../target/application/detectGreenfieldInstallTargets.js'
import type { BulkInstallPersistenceEntry } from './installPersistence.js'
import { InstallPersistence } from './installPersistence.js'
import { planPackageInstall } from './installPackagePlan.js'
import { buildInstallContext } from './resolveInstallContext.js'
import { isGreenfieldInstallBootstrap } from './resolveInstallTargets.js'
import { resolveLockRef } from './resolveLockRef.js'
import { downloadArtifact } from '../infrastructure/artifactDownloader.js'
import {
  extractPackageArtifact,
  rollbackExtractEntries,
  type ExtractRollbackEntry,
} from '../infrastructure/packageExtractor.js'
import type { InstallResult } from '../domain/installResult.js'

export interface BulkInstallServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly global?: boolean
  readonly yes?: boolean
  readonly dryRun?: boolean
  readonly noSave?: boolean
  readonly preferOnline?: boolean
  /** Single package ref (for example `update <package-id>`). */
  readonly packageId?: string
  /** One or more package refs (for example variadic `install <package-id>...`). */
  readonly packageIds?: readonly string[]
  readonly enforceConfiguredOnly?: boolean
  readonly force?: boolean
}

const resolveRequestedPackageRefs = (
  options: BulkInstallServiceOptions,
): readonly string[] | undefined => {
  if (options.packageIds !== undefined && options.packageIds.length > 0) {
    return options.packageIds
  }

  if (options.packageId !== undefined) {
    return [options.packageId]
  }

  return undefined
}

const resolveBulkPackageIds = (options: {
  readonly hasRequestedPackages: boolean
  readonly requestedPackageRefs: readonly string[] | undefined
  readonly resolvedPackages: Record<string, string>
  readonly catalogResult: Awaited<ReturnType<typeof buildInstallContext>>['catalogResult']
  readonly enforceConfiguredOnly: boolean
}): string[] => {
  const configuredPackageIds = Object.keys(options.resolvedPackages).sort((left, right) =>
    left.localeCompare(right),
  )

  if (!options.hasRequestedPackages || options.requestedPackageRefs === undefined) {
    return configuredPackageIds
  }

  const resolvedIds: string[] = []
  const seenQualified = new Set<string>()

  for (const packageRef of options.requestedPackageRefs) {
    const qualifiedId = resolvePackageRef(packageRef, options.catalogResult.catalog.aliases)

    if (
      options.enforceConfiguredOnly &&
      !Object.hasOwn(options.resolvedPackages, qualifiedId)
    ) {
      throw new ConfigValidationError(
        `Package ${qualifiedId} is not listed in agents.json packages`,
        'package_not_configured',
      )
    }

    const pkg = resolvePackageInCatalog(options.catalogResult.catalog, qualifiedId)
    if (!seenQualified.has(pkg.id)) {
      seenQualified.add(pkg.id)
      resolvedIds.push(pkg.id)
    }
  }

  return resolvedIds
}

export class BulkInstallService {
  private readonly configResolver = new ConfigResolver()
  private readonly installPersistence = new InstallPersistence()
  private readonly lockFileService = new LockFileService()

  async runAll(options: BulkInstallServiceOptions): Promise<InstallResult[]> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const globalScope = options.global === true
    const configCwd = globalScope ? resolveAgentsRepoHome(env) : cwd

    let resolved = await this.configResolver.resolve({
      cwd: configCwd,
      env,
      globalScope,
      waiveConflicts: options.yes ?? false,
    })

    const enforceConfiguredOnly = options.enforceConfiguredOnly === true
    const requestedPackageRefs = resolveRequestedPackageRefs(options)
    const hasRequestedPackages =
      requestedPackageRefs !== undefined && requestedPackageRefs.length > 0

    if (
      enforceConfiguredOnly &&
      hasRequestedPackages &&
      Object.keys(resolved.packages).length === 0
    ) {
      throw new ConfigValidationError(
        `Package ${requestedPackageRefs[0]} is not listed in agents.json packages`,
        'package_not_configured',
      )
    }

    let bootstrapWarnings: string[] = []

    if (
      isGreenfieldInstallBootstrap(
        resolved,
        hasRequestedPackages ? requestedPackageRefs[0] : undefined,
      )
    ) {
      const detection = await detectGreenfieldInstallTargets(cwd)
      resolved = { ...resolved, targets: detection.targets }
      bootstrapWarnings = [...detection.warnings]
    }

    const configuredPackageIds = Object.keys(resolved.packages).sort((left, right) =>
      left.localeCompare(right),
    )

    if (configuredPackageIds.length === 0 && !hasRequestedPackages) {
      return []
    }

    const context = await buildInstallContext({
      resolved,
      cwd: configCwd,
      env,
      globalFlag: globalScope,
    })

    const { targets, scope, catalogResult, warnings: contextWarnings } = context
    const warnings = [...bootstrapWarnings, ...contextWarnings]

    const packageIds = hasRequestedPackages
      ? resolveBulkPackageIds({
          hasRequestedPackages,
          requestedPackageRefs,
          resolvedPackages: resolved.packages,
          catalogResult,
          enforceConfiguredOnly,
        })
      : configuredPackageIds

    if (packageIds.length === 0) {
      return []
    }

    const noSave = options.noSave === true
    const dryRun = options.dryRun === true
    const preferOnline = options.preferOnline === true
    const forceSameVersion = options.force === true

    const lockDocument = dryRun ? null : await this.lockFileService.read(resolved.lockPath)
    const lockPackages = lockDocument?.packages

    const results: InstallResult[] = []
    const persistenceEntries: BulkInstallPersistenceEntry[] = []
    const rollbackEntriesAll: ExtractRollbackEntry[] = []

    try {
      for (const target of targets) {
        for (const packageId of packageIds) {
          const packageWarnings = [...warnings]
          const plan = await planPackageInstall({
            catalogResult,
            resolved,
            packageId,
            target,
            warnings: packageWarnings,
          })

          const resultBase: InstallResult = {
            packageId: plan.pkg.id,
            version: plan.version,
            target,
            extractRoot: scope.extractRoot,
            artifactUrl: plan.artifactUrl,
            saved: false,
            dryRun,
            global: scope.global,
            noSave,
            warnings: packageWarnings,
          }

          if (dryRun) {
            results.push(resultBase)
            continue
          }

          const zipBytes = await downloadArtifact(plan.artifactUrl, {
            expectedSha256Hex: plan.artifact.sha256,
            preferOnline,
            env,
          })
          const priorLockVersion = lockPackages?.[plan.pkg.id]?.version
          const overwriteOnMismatch =
            priorLockVersion === undefined || priorLockVersion !== plan.version

          const extractResult = await extractPackageArtifact(
            zipBytes,
            target,
            plan.version,
            scope.extractRoot,
            {
              overwriteOnMismatch,
              forceSameVersion,
            },
          )
          rollbackEntriesAll.push(...extractResult.rollbackEntries)

          persistenceEntries.push({
            packageId: plan.pkg.id,
            version: plan.version,
            target,
            artifact: plan.artifact,
          })

          results.push(resultBase)
        }
      }
    } catch (error) {
      await rollbackExtractEntries(rollbackEntriesAll)
      throw error
    }

    const shouldPersist = !noSave && !dryRun && persistenceEntries.length > 0

    if (shouldPersist && scope.persistScopeConfig) {
      try {
        const resolvedRef = resolveLockRef(resolved, catalogResult)
        const initialPackages = resolved.packages
        const adHocPackageRanges: Record<string, string> = {}
        const seenAdHoc = new Set<string>()
        for (const entry of persistenceEntries) {
          if (
            !Object.hasOwn(initialPackages, entry.packageId) &&
            !seenAdHoc.has(entry.packageId)
          ) {
            adHocPackageRanges[entry.packageId] = `^${entry.version}`
            seenAdHoc.add(entry.packageId)
          }
        }
        await this.installPersistence.saveBulk({
          resolved,
          resolvedRef,
          entries: persistenceEntries,
          writeLock: true,
          adHocPackageRanges:
            Object.keys(adHocPackageRanges).length > 0 ? adHocPackageRanges : undefined,
        })
      } catch (error) {
        await rollbackExtractEntries(rollbackEntriesAll)
        throw error
      }
    }

    const saved = shouldPersist && scope.persistScopeConfig

    return results.map((result) => ({
      ...result,
      saved,
    }))
  }
}
