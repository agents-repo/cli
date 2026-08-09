import { ConfigResolver } from '../../config/application/configResolver.js'
import { LockFileService } from '../../config/application/lockFileService.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
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

type BulkInstallContext = Awaited<ReturnType<typeof buildInstallContext>>

interface PreparedBulkInstall {
  readonly resolved: ResolvedAgentsConfig
  readonly configCwd: string
  readonly context: BulkInstallContext
  readonly packageIds: string[]
  readonly warnings: string[]
  readonly noSave: boolean
  readonly dryRun: boolean
  readonly preferOnline: boolean
  readonly forceSameVersion: boolean
}

const applyGreenfieldBootstrap = async (
  resolved: ResolvedAgentsConfig,
  cwd: string,
  hasRequestedPackages: boolean,
  requestedPackageRefs: readonly string[] | undefined,
): Promise<{ readonly resolved: ResolvedAgentsConfig; readonly bootstrapWarnings: string[] }> => {
  if (
    !isGreenfieldInstallBootstrap(
      resolved,
      hasRequestedPackages ? requestedPackageRefs?.[0] : undefined,
    )
  ) {
    return { resolved, bootstrapWarnings: [] }
  }

  const detection = await detectGreenfieldInstallTargets(cwd)
  return {
    resolved: { ...resolved, targets: detection.targets },
    bootstrapWarnings: [...detection.warnings],
  }
}

const buildPreparedBulkInstall = (options: {
  readonly resolved: ResolvedAgentsConfig
  readonly configCwd: string
  readonly context: BulkInstallContext
  readonly bootstrapWarnings: string[]
  readonly hasRequestedPackages: boolean
  readonly requestedPackageRefs: readonly string[] | undefined
  readonly enforceConfiguredOnly: boolean
  readonly installOptions: BulkInstallServiceOptions
}): PreparedBulkInstall | null => {
  const { catalogResult, warnings: contextWarnings } = options.context
  const warnings = [...options.bootstrapWarnings, ...contextWarnings]

  const configuredPackageIds = Object.keys(options.resolved.packages).sort((left, right) =>
    left.localeCompare(right),
  )

  const packageIds = options.hasRequestedPackages
    ? resolveBulkPackageIds({
        hasRequestedPackages: options.hasRequestedPackages,
        requestedPackageRefs: options.requestedPackageRefs,
        resolvedPackages: options.resolved.packages,
        catalogResult,
        enforceConfiguredOnly: options.enforceConfiguredOnly,
      })
    : configuredPackageIds

  if (packageIds.length === 0) {
    return null
  }

  return {
    resolved: options.resolved,
    configCwd: options.configCwd,
    context: options.context,
    packageIds,
    warnings,
    noSave: options.installOptions.noSave === true,
    dryRun: options.installOptions.dryRun === true,
    preferOnline: options.installOptions.preferOnline === true,
    forceSameVersion: options.installOptions.force === true,
  }
}

const prepareBulkInstall = async (
  configResolver: ConfigResolver,
  options: BulkInstallServiceOptions,
): Promise<PreparedBulkInstall | null> => {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const globalScope = options.global === true
  const configCwd = globalScope ? resolveAgentsRepoHome(env) : cwd

  let resolved = await configResolver.resolve({
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

  const { resolved: bootstrappedResolved, bootstrapWarnings } = await applyGreenfieldBootstrap(
    resolved,
    cwd,
    hasRequestedPackages,
    requestedPackageRefs,
  )
  resolved = bootstrappedResolved

  const configuredPackageIds = Object.keys(resolved.packages).sort((left, right) =>
    left.localeCompare(right),
  )

  if (configuredPackageIds.length === 0 && !hasRequestedPackages) {
    return null
  }

  const context = await buildInstallContext({
    resolved,
    cwd: configCwd,
    env,
    globalFlag: globalScope,
  })

  return buildPreparedBulkInstall({
    resolved,
    configCwd,
    context,
    bootstrapWarnings,
    hasRequestedPackages,
    requestedPackageRefs,
    enforceConfiguredOnly,
    installOptions: options,
  })
}

const installBulkPackageForTarget = async (options: {
  readonly prepared: PreparedBulkInstall
  readonly target: BulkInstallContext['targets'][number]
  readonly packageId: string
  readonly lockPackages: Record<string, { readonly version: string }> | undefined
  readonly env: NodeJS.ProcessEnv
}): Promise<{
  readonly result: InstallResult
  readonly persistenceEntry: BulkInstallPersistenceEntry | undefined
  readonly rollbackEntries: ExtractRollbackEntry[]
}> => {
  const { prepared, target, packageId, lockPackages, env } = options
  const { resolved, context, warnings, dryRun, preferOnline, forceSameVersion } = prepared
  const { scope, catalogResult } = context

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
    noSave: prepared.noSave,
    warnings: packageWarnings,
  }

  if (dryRun) {
    return { result: resultBase, persistenceEntry: undefined, rollbackEntries: [] }
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

  return {
    result: resultBase,
    persistenceEntry: {
      packageId: plan.pkg.id,
      version: plan.version,
      target,
      artifact: plan.artifact,
    },
    rollbackEntries: [...extractResult.rollbackEntries],
  }
}

const executeBulkInstallLoop = async (options: {
  readonly prepared: PreparedBulkInstall
  readonly lockPackages: Record<string, { readonly version: string }> | undefined
  readonly env: NodeJS.ProcessEnv
}): Promise<{
  readonly results: InstallResult[]
  readonly persistenceEntries: BulkInstallPersistenceEntry[]
  readonly rollbackEntriesAll: ExtractRollbackEntry[]
}> => {
  const { prepared, lockPackages, env } = options
  const { packageIds } = prepared
  const { targets } = prepared.context

  const results: InstallResult[] = []
  const persistenceEntries: BulkInstallPersistenceEntry[] = []
  const rollbackEntriesAll: ExtractRollbackEntry[] = []

  try {
    for (const target of targets) {
      for (const packageId of packageIds) {
        const installOutcome = await installBulkPackageForTarget({
          prepared,
          target,
          packageId,
          lockPackages,
          env,
        })
        rollbackEntriesAll.push(...installOutcome.rollbackEntries)
        if (installOutcome.persistenceEntry !== undefined) {
          persistenceEntries.push(installOutcome.persistenceEntry)
        }
        results.push(installOutcome.result)
      }
    }
  } catch (error) {
    await rollbackExtractEntries(rollbackEntriesAll)
    throw error
  }

  return { results, persistenceEntries, rollbackEntriesAll }
}

const persistBulkInstallResults = async (options: {
  readonly installPersistence: InstallPersistence
  readonly prepared: PreparedBulkInstall
  readonly persistenceEntries: BulkInstallPersistenceEntry[]
  readonly rollbackEntriesAll: ExtractRollbackEntry[]
}): Promise<void> => {
  const { installPersistence, prepared, persistenceEntries, rollbackEntriesAll } = options
  const { resolved, context } = prepared
  const { scope, catalogResult } = context
  const shouldPersist =
    !prepared.noSave && !prepared.dryRun && persistenceEntries.length > 0

  if (!shouldPersist || !scope.persistScopeConfig) {
    return
  }

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
    await installPersistence.saveBulk({
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

export class BulkInstallService {
  private readonly configResolver = new ConfigResolver()
  private readonly installPersistence = new InstallPersistence()
  private readonly lockFileService = new LockFileService()

  async runAll(options: BulkInstallServiceOptions): Promise<InstallResult[]> {
    const env = options.env ?? process.env
    const prepared = await prepareBulkInstall(this.configResolver, options)
    if (prepared === null) {
      return []
    }

    const lockDocument = prepared.dryRun
      ? null
      : await this.lockFileService.read(prepared.resolved.lockPath)
    const lockPackages = lockDocument?.packages

    const loopResult = await executeBulkInstallLoop({
      prepared,
      lockPackages,
      env,
    })

    await persistBulkInstallResults({
      installPersistence: this.installPersistence,
      prepared,
      persistenceEntries: loopResult.persistenceEntries,
      rollbackEntriesAll: loopResult.rollbackEntriesAll,
    })

    const saved =
      !prepared.noSave &&
      !prepared.dryRun &&
      loopResult.persistenceEntries.length > 0 &&
      prepared.context.scope.persistScopeConfig

    return loopResult.results.map((result) => ({
      ...result,
      saved,
    }))
  }
}
