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
import { planRemoveSlots, type RemoveSlotPlan } from './planRemoveSlots.js'
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

const processRemoveSlot = async (options: {
  readonly plan: RemoveSlotPlan
  readonly warnings: readonly string[]
  readonly scope: ReturnType<typeof resolveInstallScope>
  readonly dryRun: boolean
  readonly noSave: boolean
  readonly force: boolean
  readonly preferOnline: boolean
  readonly env: NodeJS.ProcessEnv
  readonly parseIntegrityHex: (integrity: string) => string
}): Promise<{
  readonly result: RemoveResult
  readonly completedSlot: RestoreRemovedSlotInput | undefined
  readonly blockingSkip: boolean
}> => {
  const slotWarnings = [...options.warnings]
  const expectedHex = options.parseIntegrityHex(options.plan.slot.integrity)

  const resultBase: RemoveResult = {
    packageId: options.plan.packageId,
    version: options.plan.version,
    target: options.plan.target,
    extractRoot: options.scope.extractRoot,
    artifactUrl: options.plan.artifactUrl,
    saved: false,
    dryRun: options.dryRun,
    global: options.scope.global,
    noSave: options.noSave,
    warnings: slotWarnings,
    deletedPaths: [],
  }

  const zipBytes = await downloadArtifact(options.plan.artifactUrl, {
    expectedSha256Hex: expectedHex,
    preferOnline: options.preferOnline,
    env: options.env,
  })
  const extractPlan = planArtifactExtractFromZip(
    zipBytes,
    options.plan.target,
    options.plan.version,
    options.scope.extractRoot,
  )

  if (options.dryRun) {
    return {
      result: {
        ...resultBase,
        deletedPaths: extractPlan.absolutePaths,
        warnings: [
          ...slotWarnings,
          `Dry run: would remove ${extractPlan.absolutePaths.length} file(s) for target ${options.plan.target}`,
        ],
      },
      completedSlot: undefined,
      blockingSkip: false,
    }
  }

  const { deletedPaths, warnings: removeWarnings } = await removeInstalledFiles(
    extractPlan.absolutePaths,
    options.scope.extractRoot,
    options.plan.target,
    extractPlan.digestByRelativePath,
    { force: options.force },
  )

  return {
    result: {
      ...resultBase,
      deletedPaths,
      warnings: [...slotWarnings, ...removeWarnings],
    },
    completedSlot: {
      zipBytes,
      targetId: options.plan.target,
      version: options.plan.version,
      extractRoot: options.scope.extractRoot,
      deletedPaths,
    },
    blockingSkip: removeWarnings.some(isBlockingRemoveWarning),
  }
}

const prepareRemoveRun = async (options: {
  readonly configResolver: ConfigResolver
  readonly lockFileService: LockFileService
  readonly serviceOptions: RemoveServiceOptions
  readonly configCwd: string
  readonly env: NodeJS.ProcessEnv
  readonly globalScope: boolean
}): Promise<{
  readonly resolved: Awaited<ReturnType<ConfigResolver['resolve']>>
  readonly scope: ReturnType<typeof resolveInstallScope>
  readonly warnings: string[]
  readonly slotPlans: RemoveSlotPlan[]
  readonly qualifiedId: string
}> => {
  const resolved = await options.configResolver.resolve({
    cwd: options.configCwd,
    env: options.env,
    globalScope: options.globalScope,
    waiveConflicts: options.serviceOptions.yes ?? false,
  })

  const warnings = resolved.warnings.map((warning) => warning.message)
  const scope = resolveInstallScope({
    cwd: options.configCwd,
    env: options.env,
    globalFlag: options.globalScope,
  })

  const lock = await options.lockFileService.read(resolved.lockPath)
  if (lock === null) {
    throw new LockValidationError('agents-lock.json is missing')
  }

  const catalogResult = await loadRegistryCatalog({
    ...resolved.registry,
    ref: lock.resolvedRef,
  })
  warnings.push(...catalogResult.warnings)

  const qualifiedId = resolvePackageRef(
    options.serviceOptions.packageId,
    catalogResult.catalog.aliases,
  )

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

  return { resolved, scope, warnings, slotPlans, qualifiedId }
}

const finalizeRemoveRun = async (options: {
  readonly removePersistence: RemovePersistence
  readonly resolved: Awaited<ReturnType<ConfigResolver['resolve']>>
  readonly qualifiedId: string
  readonly scope: ReturnType<typeof resolveInstallScope>
  readonly results: RemoveResult[]
  readonly completedSlots: RestoreRemovedSlotInput[]
  readonly blockingSkip: boolean
  readonly dryRun: boolean
  readonly noSave: boolean
}): Promise<RemoveResult[]> => {
  const shouldPersist =
    !options.noSave && !options.dryRun && !options.blockingSkip && options.results.length > 0

  if (shouldPersist && options.scope.persistScopeConfig) {
    try {
      await options.removePersistence.remove(options.resolved, options.qualifiedId)
    } catch (error) {
      await rollbackRemovedSlots(options.completedSlots)
      throw error
    }
  }

  const saved = shouldPersist && options.scope.persistScopeConfig

  return options.results.map((result) => ({
    ...result,
    saved,
  }))
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

    const { resolved, scope, warnings, slotPlans, qualifiedId } = await prepareRemoveRun({
      configResolver: this.configResolver,
      lockFileService: this.lockFileService,
      serviceOptions: options,
      configCwd,
      env,
      globalScope,
    })

    const results: RemoveResult[] = []
    const completedSlots: RestoreRemovedSlotInput[] = []
    let blockingSkip = false

    try {
      for (const plan of slotPlans) {
        const slotOutcome = await processRemoveSlot({
          plan,
          warnings,
          scope,
          dryRun,
          noSave,
          force,
          preferOnline,
          env,
          parseIntegrityHex: (integrity) => this.lockFileService.parseIntegrityHex(integrity),
        })

        if (slotOutcome.blockingSkip) {
          blockingSkip = true
        }

        if (slotOutcome.completedSlot !== undefined) {
          completedSlots.push(slotOutcome.completedSlot)
        }

        results.push(slotOutcome.result)
      }

      return await finalizeRemoveRun({
        removePersistence: this.removePersistence,
        resolved,
        qualifiedId,
        scope,
        results,
        completedSlots,
        blockingSkip,
        dryRun,
        noSave,
      })
    } catch (error) {
      await rollbackRemovedSlots(completedSlots)
      throw error
    }
  }
}
