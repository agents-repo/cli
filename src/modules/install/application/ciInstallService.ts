import { ConfigResolver } from '../../config/application/configResolver.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { LockValidationError } from '../../config/domain/configErrors.js'
import { evaluatePackageStatusPolicy } from '../../registry/application/packageStatusPolicy.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import type { RegistryPackage } from '../../registry/domain/package.js'
import { loadRegistryCatalog } from '../../registry/infrastructure/registryRepository.js'
import { downloadArtifact } from '../infrastructure/artifactDownloader.js'
import {
  extractPackageArtifact,
  rollbackExtractedPaths,
} from '../infrastructure/packageExtractor.js'
import type { InstallResult } from '../domain/installResult.js'
import { planFrozenInstallSlot } from './planFrozenInstallSlot.js'
import { resolveInstallScope } from './installScope.js'
import { resolveInstallTargets } from './resolveInstallTargets.js'
import {
  validateCiConfigLockPackageSets,
  validateCiRequiredByTargetSlots,
} from './validateCiPrerequisites.js'
import { validateLockVersionRanges } from './validateLockVersionRanges.js'

export interface CiInstallServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly yes?: boolean
  readonly dryRun?: boolean
  readonly force?: boolean
  readonly preferOnline?: boolean
}

export class CiInstallService {
  private readonly configResolver = new ConfigResolver()
  private readonly lockFileService = new LockFileService()

  async run(options: CiInstallServiceOptions = {}): Promise<InstallResult[]> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const dryRun = options.dryRun === true
    const force = options.force === true
    const preferOnline = options.preferOnline === true

    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      globalScope: false,
      waiveConflicts: options.yes ?? false,
    })

    const warnings = resolved.warnings.map((warning) => warning.message)
    const scope = resolveInstallScope({ cwd, env, globalFlag: false })

    const lock = await this.lockFileService.read(resolved.lockPath)
    if (lock === null) {
      throw new LockValidationError('agents-lock.json is missing')
    }

    validateCiConfigLockPackageSets(resolved, lock)

    const targets = resolveInstallTargets(resolved)
    const packageIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))

    validateCiRequiredByTargetSlots(lock, packageIds, targets)
    validateLockVersionRanges(resolved, lock, { force })

    if (packageIds.length === 0) {
      return []
    }

    const catalogResult = await loadRegistryCatalog({
      ...resolved.registry,
      ref: lock.resolvedRef,
    })
    warnings.push(...catalogResult.warnings)

    const results: InstallResult[] = []
    const extractedPathsAll: string[] = []
    const catalogPackages = new Map<string, RegistryPackage>()
    const resolveCatalogPackage = (packageId: string): RegistryPackage => {
      const cached = catalogPackages.get(packageId)
      if (cached !== undefined) {
        return cached
      }

      const pkg = resolvePackageInCatalog(catalogResult.catalog, packageId)
      catalogPackages.set(packageId, pkg)
      return pkg
    }

    try {
      for (const target of targets) {
        for (const packageId of packageIds) {
          const lockEntry = lock.packages[packageId]
          const slot = lockEntry.byTarget[target]!

          const packageWarnings = [...warnings]
          const pkg = resolveCatalogPackage(packageId)
          const statusPolicy = evaluatePackageStatusPolicy(pkg.status, pkg.id)
          packageWarnings.push(...statusPolicy.warnings)

          const plan = planFrozenInstallSlot({
            catalogResult,
            pkg,
            version: lockEntry.version,
            target,
            slot,
          })

          const resultBase: InstallResult = {
            packageId: plan.packageId,
            version: plan.version,
            target: plan.target,
            extractRoot: scope.extractRoot,
            artifactUrl: plan.artifactUrl,
            saved: false,
            dryRun,
            global: scope.global,
            noSave: true,
            warnings: packageWarnings,
          }

          if (dryRun) {
            results.push(resultBase)
            continue
          }

          const expectedHex = this.lockFileService.parseIntegrityHex(plan.slot.integrity)
          const zipBytes = await downloadArtifact(plan.artifactUrl, {
            expectedSha256Hex: expectedHex,
            preferOnline,
            env,
          })
          const extractedPaths = await extractPackageArtifact(
            zipBytes,
            plan.target,
            plan.version,
            scope.extractRoot,
          )
          extractedPathsAll.push(...extractedPaths)
          results.push(resultBase)
        }
      }
    } catch (error) {
      await rollbackExtractedPaths(extractedPathsAll)
      throw error
    }

    return results
  }
}
