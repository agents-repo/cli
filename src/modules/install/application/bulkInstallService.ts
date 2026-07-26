import { ConfigResolver } from '../../config/application/configResolver.js'
import type { BulkInstallPersistenceEntry } from './installPersistence.js'
import { InstallPersistence } from './installPersistence.js'
import { planPackageInstall } from './installPackagePlan.js'
import { buildInstallContext } from './resolveInstallContext.js'
import { resolveLockRef } from './resolveLockRef.js'
import { downloadArtifact } from '../infrastructure/artifactDownloader.js'
import { verifySha256 } from '../infrastructure/sha256Verifier.js'
import {
  extractPackageArtifact,
  rollbackExtractedPaths,
} from '../infrastructure/packageExtractor.js'
import type { InstallResult } from '../domain/installResult.js'

export interface BulkInstallServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly target?: string
  readonly global?: boolean
  readonly yes?: boolean
  readonly dryRun?: boolean
  readonly noSave?: boolean
}

export class BulkInstallService {
  private readonly configResolver = new ConfigResolver()
  private readonly installPersistence = new InstallPersistence()

  async runAll(options: BulkInstallServiceOptions): Promise<InstallResult[]> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env

    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      waiveConflicts: options.yes ?? false,
    })

    const packageIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))

    if (packageIds.length === 0) {
      return []
    }

    const context = await buildInstallContext({
      resolved,
      cwd,
      env,
      targetOverride: options.target,
      globalFlag: options.global,
    })

    const { target, scope, catalogResult, warnings } = context
    const noSave = options.noSave === true
    const dryRun = options.dryRun === true

    const results: InstallResult[] = []
    const persistenceEntries: BulkInstallPersistenceEntry[] = []
    const extractedPathsAll: string[] = []

    try {
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

        const zipBytes = await downloadArtifact(plan.artifactUrl)
        verifySha256(zipBytes, plan.artifact.sha256)
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
    } catch (error) {
      await rollbackExtractedPaths(extractedPathsAll)
      throw error
    }

    const shouldPersist = !noSave && !dryRun && persistenceEntries.length > 0
    const writeLock = shouldPersist && scope.mutateProjectConfig
    const writeGlobalState = shouldPersist && scope.global

    if (shouldPersist && writeLock) {
      try {
        const resolvedRef = resolveLockRef(resolved, catalogResult)
        await this.installPersistence.saveBulk({
          resolved: { ...resolved, target },
          resolvedRef,
          entries: persistenceEntries,
          writeLock: true,
        })
      } catch (error) {
        await rollbackExtractedPaths(extractedPathsAll)
        throw error
      }
    } else if (writeGlobalState) {
      try {
        const resolvedRef = resolveLockRef(resolved, catalogResult)
        await this.installPersistence.saveGlobalBulk({
          env,
          resolvedRef,
          entries: persistenceEntries,
        })
      } catch (error) {
        await rollbackExtractedPaths(extractedPathsAll)
        throw error
      }
    }

    const saved = writeLock || writeGlobalState

    return results.map((result) => ({
      ...result,
      saved,
    }))
  }
}
