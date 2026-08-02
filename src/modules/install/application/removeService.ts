import { ConfigResolver } from '../../config/application/configResolver.js'
import { ConfigValidationError, LockValidationError } from '../../config/domain/configErrors.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { resolveAgentsRepoHome } from '../../config/infrastructure/agentsRepoHome.js'
import { loadRegistryCatalog } from '../../registry/infrastructure/registryRepository.js'
import { resolvePackageRef } from '../../registry/domain/package.js'
import type { RemoveResult } from '../domain/removeResult.js'
import { planArtifactExtractFromZip } from '../infrastructure/artifactExtractPaths.js'
import { downloadArtifact } from '../infrastructure/artifactDownloader.js'
import {
  isBlockingRemoveWarning,
  removeInstalledFiles,
  rollbackRemovedSlots,
  type RestoreRemovedSlotInput,
} from '../infrastructure/packageRemover.js'
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
  readonly preferOnline?: boolean
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
    const preferOnline = options.preferOnline === true

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
      throw new LockValidationError('agents-lock.json is missing')
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
    const completedSlots: RestoreRemovedSlotInput[] = []
    let blockingSkip = false

    try {
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

        const zipBytes = await downloadArtifact(plan.artifactUrl, {
          expectedSha256Hex: expectedHex,
          preferOnline,
          env,
        })
        const extractPlan = planArtifactExtractFromZip(
          zipBytes,
          plan.target,
          plan.version,
          scope.extractRoot,
        )

        if (dryRun) {
          results.push({
            ...resultBase,
            deletedPaths: extractPlan.absolutePaths,
            warnings: [
              ...slotWarnings,
              `Dry run: would remove ${extractPlan.absolutePaths.length} file(s) for target ${plan.target}`,
            ],
          })
          continue
        }

        const { deletedPaths, warnings: removeWarnings } = await removeInstalledFiles(
          extractPlan.absolutePaths,
          scope.extractRoot,
          plan.target,
          extractPlan.digestByRelativePath,
          { force },
        )

        if (removeWarnings.some(isBlockingRemoveWarning)) {
          blockingSkip = true
        }

        completedSlots.push({
          zipBytes,
          targetId: plan.target,
          version: plan.version,
          extractRoot: scope.extractRoot,
          deletedPaths,
        })

        results.push({
          ...resultBase,
          deletedPaths,
          warnings: [...slotWarnings, ...removeWarnings],
        })
      }

      const shouldPersist = !noSave && !dryRun && !blockingSkip && results.length > 0

      if (shouldPersist && scope.persistScopeConfig) {
        try {
          await this.removePersistence.remove(resolved, qualifiedId)
        } catch (error) {
          await rollbackRemovedSlots(completedSlots)
          throw error
        }
      }

      const saved = shouldPersist && scope.persistScopeConfig

      return results.map((result) => ({
        ...result,
        saved,
      }))
    } catch (error) {
      await rollbackRemovedSlots(completedSlots)
      throw error
    }
  }
}
