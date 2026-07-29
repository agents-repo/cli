import { ConfigResolver } from '../../config/application/configResolver.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { resolveAgentsRepoHome } from '../../config/infrastructure/agentsRepoHome.js'
import { loadRegistryCatalog } from '../../registry/infrastructure/registryRepository.js'
import { resolvePackageRef } from '../../registry/domain/package.js'
import type { RemoveResult } from '../domain/removeResult.js'
import {
  buildZipEntryDigestByMappedPath,
  resolveArtifactExtractPaths,
} from '../infrastructure/artifactExtractPaths.js'
import { downloadArtifact } from '../infrastructure/artifactDownloader.js'
import { removeInstalledFiles } from '../infrastructure/packageRemover.js'
import { verifySha256 } from '../infrastructure/sha256Verifier.js'
import { resolveInstallScope } from './installScope.js'
import { planRemoveSlots } from './planRemoveSlots.js'
import { RemovePersistence } from './removePersistence.js'

export interface RemoveServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly packageId: string
  readonly global?: boolean
  readonly yes?: boolean
  readonly dryRun?: boolean
  readonly noSave?: boolean
  readonly force?: boolean
}

export class RemoveService {
  private readonly configResolver = new ConfigResolver()
  private readonly lockFileService = new LockFileService()
  private readonly removePersistence = new RemovePersistence()

  async run(options: RemoveServiceOptions): Promise<RemoveResult[]> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const globalScope = options.global === true
    const configCwd = globalScope ? resolveAgentsRepoHome(env) : cwd
    const dryRun = options.dryRun === true
    const noSave = options.noSave === true
    const force = options.force === true

    const resolved = await this.configResolver.resolve({
      cwd: configCwd,
      env,
      globalScope,
      waiveConflicts: options.yes ?? false,
    })

    const warnings = resolved.warnings.map((warning) => warning.message)
    const scope = resolveInstallScope({
      cwd: configCwd,
      env,
      globalFlag: globalScope,
    })

    const lock = await this.lockFileService.read(resolved.lockPath)
    if (lock === null) {
      throw new ConfigValidationError(
        `Package ${options.packageId} is not present in agents-lock.json`,
        'package_not_in_lock',
      )
    }

    const catalogResult = await loadRegistryCatalog({
      ...resolved.registry,
      ref: lock.resolvedRef,
    })
    warnings.push(...catalogResult.warnings)

    const qualifiedId = resolvePackageRef(options.packageId, catalogResult.catalog.aliases)

    if (!Object.hasOwn(resolved.packages, qualifiedId)) {
      throw new ConfigValidationError(
        `Package ${qualifiedId} is not listed in agents.json packages`,
        'package_not_configured',
      )
    }

    const lockEntry = lock.packages[qualifiedId]
    if (!Object.hasOwn(lock.packages, qualifiedId)) {
      throw new ConfigValidationError(
        `Package ${qualifiedId} is not present in agents-lock.json`,
        'package_not_in_lock',
      )
    }

    const slotPlans = planRemoveSlots({
      catalogResult,
      packageId: qualifiedId,
      version: lockEntry.version,
      byTarget: lockEntry.byTarget,
    })

    const results: RemoveResult[] = []

    for (const plan of slotPlans) {
      const slotWarnings = [...warnings]
      const expectedHex = this.lockFileService.parseIntegrityHex(plan.slot.integrity)

      const resultBase: RemoveResult = {
        packageId: plan.packageId,
        version: plan.version,
        target: plan.target,
        extractRoot: scope.extractRoot,
        artifactUrl: plan.artifactUrl,
        saved: false,
        dryRun,
        global: scope.global,
        noSave,
        warnings: slotWarnings,
        deletedPaths: [],
      }

      if (dryRun) {
        const zipBytes = await downloadArtifact(plan.artifactUrl)
        verifySha256(zipBytes, expectedHex)
        const paths = resolveArtifactExtractPaths(
          zipBytes,
          plan.target,
          plan.version,
          scope.extractRoot,
        )
        results.push({
          ...resultBase,
          deletedPaths: paths,
          warnings: [
            ...slotWarnings,
            `Dry run: would remove ${paths.length} file(s) for target ${plan.target}`,
          ],
        })
        continue
      }

      const zipBytes = await downloadArtifact(plan.artifactUrl)
      verifySha256(zipBytes, expectedHex)
      const paths = resolveArtifactExtractPaths(
        zipBytes,
        plan.target,
        plan.version,
        scope.extractRoot,
      )
      const digestMap = buildZipEntryDigestByMappedPath(zipBytes, plan.target, plan.version)
      const { deletedPaths, warnings: removeWarnings } = await removeInstalledFiles(
        paths,
        scope.extractRoot,
        plan.target,
        digestMap,
        { force },
      )

      results.push({
        ...resultBase,
        deletedPaths,
        warnings: [...slotWarnings, ...removeWarnings],
      })
    }

    const shouldPersist = !noSave && !dryRun && results.length > 0

    if (shouldPersist && scope.persistScopeConfig) {
      await this.removePersistence.remove(resolved, qualifiedId)
    }

    const saved = shouldPersist && scope.persistScopeConfig

    return results.map((result) => ({
      ...result,
      saved,
    }))
  }
}
