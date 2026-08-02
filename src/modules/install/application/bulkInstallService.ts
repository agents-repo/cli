import { ConfigResolver } from '../../config/application/configResolver.js'
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
  rollbackExtractedPaths,
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

export class BulkInstallService {
  private readonly configResolver = new ConfigResolver()
  private readonly installPersistence = new InstallPersistence()

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

    let packageIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))

    if (packageIds.length === 0 && !hasRequestedPackages) {
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

    if (hasRequestedPackages) {
      const resolvedIds: string[] = []
      const seenQualified = new Set<string>()

      for (const packageRef of requestedPackageRefs) {
        const qualifiedId = resolvePackageRef(
          packageRef,
          catalogResult.catalog.aliases,
        )

        if (enforceConfiguredOnly && !Object.hasOwn(resolved.packages, qualifiedId)) {
          throw new ConfigValidationError(
            `Package ${qualifiedId} is not listed in agents.json packages`,
            'package_not_configured',
          )
        }

        const pkg = resolvePackageInCatalog(catalogResult.catalog, qualifiedId)
        if (!seenQualified.has(pkg.id)) {
          seenQualified.add(pkg.id)
          resolvedIds.push(pkg.id)
        }
      }

      packageIds = resolvedIds
    }

    if (packageIds.length === 0) {
      return []
    }

    const noSave = options.noSave === true
    const dryRun = options.dryRun === true
    const preferOnline = options.preferOnline === true

    const results: InstallResult[] = []
    const persistenceEntries: BulkInstallPersistenceEntry[] = []
    const extractedPathsAll: string[] = []

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
          const extractedPaths = await extractPackageArtifact(
            zipBytes,
            target,
            plan.version,
            scope.extractRoot,
          )
          extractedPathsAll.push(...extractedPaths)

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
      await rollbackExtractedPaths(extractedPathsAll)
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
        await rollbackExtractedPaths(extractedPathsAll)
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
