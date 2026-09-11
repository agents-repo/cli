import { existsSync } from 'node:fs'

import { ConfigResolver } from './configResolver.js'
import { LockFileService } from './lockFileService.js'
import type { ResolvedAgentsConfig } from '../domain/agentsConfig.js'
import type { AgentsLockDocument } from '../domain/agentsLock.js'
import { ConfigError, LockValidationError } from '../domain/configErrors.js'
import { RegistryError, RegistryFetchError } from '../../registry/domain/errors.js'
import {
  loadRegistryCatalog,
  type RegistryCatalogLoadResult,
} from '../../registry/infrastructure/registryRepository.js'
import {
  validateCiConfigLockPackageSets,
  validateCiRequiredByTargetSlots,
} from '../../install/application/validateCiPrerequisites.js'
import { validateLockVersionRanges } from '../../install/application/validateLockVersionRanges.js'
import { resolveInstallScope } from '../../install/application/installScope.js'
import { resolveInstallTargets } from '../../install/application/resolveInstallTargets.js'
import { planArtifactExtractFromZip } from '../../install/infrastructure/artifactExtractPaths.js'
import { InstallRuntimeError } from '../../install/domain/installErrors.js'
import {
  DoctorAgentPathCollisionError,
  DoctorLegacyPathEncodingError,
  loadLockSlotArtifacts,
  type LockSlotArtifact,
  verifyAgentPathCollisions,
  verifyLegacyPathEncoding,
} from './doctorPathChecks.js'

class DoctorInstallPathsError extends Error {
  readonly code = 'install_paths_missing'
  readonly exitCode = 3 as const

  constructor(message: string) {
    super(message)
    this.name = 'DoctorInstallPathsError'
  }
}

export type DoctorCheckStatus = 'pass' | 'fail' | 'skip'

export interface DoctorCheck {
  readonly id: string
  readonly status: DoctorCheckStatus
  readonly message: string
  readonly code?: string
  readonly exitCode?: number
}

export interface DoctorResult {
  readonly checks: readonly DoctorCheck[]
  readonly warnings: readonly string[]
  readonly exitCode: number
}

export interface DoctorServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly yes?: boolean
  readonly preferOnline?: boolean
}

const getErrorCode = (error: unknown): string | undefined => {
  if (error instanceof DoctorInstallPathsError) {
    return error.code
  }

  if (error instanceof DoctorLegacyPathEncodingError) {
    return error.code
  }

  if (error instanceof DoctorAgentPathCollisionError) {
    return error.code
  }

  if (error instanceof ConfigError) {
    return error.code
  }

  if (error instanceof RegistryError) {
    return error.code
  }

  if (error instanceof InstallRuntimeError) {
    return error.code
  }

  return undefined
}

export const exitCodeForDoctorError = (error: unknown): number => {
  if (error instanceof DoctorInstallPathsError) {
    return error.exitCode
  }

  if (error instanceof DoctorLegacyPathEncodingError) {
    return error.exitCode
  }

  if (error instanceof DoctorAgentPathCollisionError) {
    return error.exitCode
  }

  if (error instanceof ConfigError) {
    return error.exitCode
  }

  if (error instanceof RegistryFetchError) {
    return 1
  }

  if (error instanceof RegistryError) {
    return 3
  }

  if (error instanceof InstallRuntimeError) {
    if (error.code === 'integrity_mismatch') {
      return 3
    }

    return error.exitCode
  }

  return 1
}

export const computeDoctorExitCode = (checks: readonly DoctorCheck[]): number => {
  let exitCode = 0

  for (const check of checks) {
    if (check.status !== 'fail') {
      continue
    }

    const candidate = check.exitCode ?? 3
    if (candidate > exitCode) {
      exitCode = candidate
    }
  }

  return exitCode
}

const passCheck = (id: string, message: string): DoctorCheck => ({
  id,
  status: 'pass',
  message,
})

const failCheck = (id: string, message: string, error: unknown): DoctorCheck => ({
  id,
  status: 'fail',
  message,
  code: getErrorCode(error) ?? 'doctor_check_failed',
  exitCode: exitCodeForDoctorError(error),
})

const skipCheck = (id: string, message: string): DoctorCheck => ({
  id,
  status: 'skip',
  message,
})

const runLockConfigSync = (resolved: ResolvedAgentsConfig, lock: AgentsLockDocument): void => {
  validateCiConfigLockPackageSets(resolved, lock)
  const targets = resolveInstallTargets(resolved)
  const packageIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))
  validateCiRequiredByTargetSlots(lock, packageIds, targets)
  validateLockVersionRanges(resolved, lock, { force: false })
}

const skipChecksAfterConfigFailure = (checks: DoctorCheck[]): void => {
  checks.push(
    skipCheck('targets_configured', 'Skipped because config resolution failed'),
    skipCheck('lock_present', 'Skipped because config resolution failed'),
    skipCheck('lock_config_sync', 'Skipped because config resolution failed'),
    skipCheck('registry_reachable', 'Skipped because config resolution failed'),
    skipCheck('install_paths', 'Skipped because config resolution failed'),
    skipCheck('legacy_path_encoding', 'Skipped because config resolution failed'),
    skipCheck('agent_path_collision', 'Skipped because config resolution failed'),
  )
}

const verifyInstallPathsFromArtifacts = (
  artifacts: readonly LockSlotArtifact[],
  extractRoot: string,
): void => {
  const missingPaths: string[] = []

  for (const artifact of artifacts) {
    const extractPlan = planArtifactExtractFromZip(
      artifact.zipBytes,
      artifact.target,
      artifact.version,
      extractRoot,
    )

    for (const absolutePath of extractPlan.absolutePaths) {
      if (!existsSync(absolutePath)) {
        missingPaths.push(absolutePath)
      }
    }
  }

  if (missingPaths.length > 0) {
    const preview = missingPaths.slice(0, 5).join(', ')
    const suffix = missingPaths.length > 5 ? ` (+${missingPaths.length - 5} more)` : ''
    throw new DoctorInstallPathsError(
      `Missing ${missingPaths.length} expected install path(s): ${preview}${suffix}`,
    )
  }
}

const resolveDoctorConfig = async (
  configResolver: ConfigResolver,
  options: DoctorServiceOptions,
  checks: DoctorCheck[],
  warnings: string[],
): Promise<ResolvedAgentsConfig | undefined> => {
  try {
    const resolved = await configResolver.resolve({
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      globalScope: false,
      waiveConflicts: options.yes ?? false,
    })
    checks.push(passCheck('config_schema', 'agents.json resolved successfully'))
    for (const warning of resolved.warnings) {
      warnings.push(warning.message)
    }
    return resolved
  } catch (error) {
    checks.push(
      failCheck(
        'config_schema',
        error instanceof Error ? error.message : 'Config resolution failed',
        error,
      ),
    )
    return undefined
  }
}

const runDoctorTargetsCheck = (
  resolved: ResolvedAgentsConfig,
  checks: DoctorCheck[],
): boolean => {
  try {
    resolveInstallTargets(resolved)
    checks.push(passCheck('targets_configured', 'Install targets are configured'))
    return true
  } catch (error) {
    checks.push(
      failCheck(
        'targets_configured',
        error instanceof Error ? error.message : 'Install targets are not configured',
        error,
      ),
    )
    return false
  }
}

const runDoctorLockCheck = async (
  lockFileService: LockFileService,
  lockPath: string,
  checks: DoctorCheck[],
): Promise<AgentsLockDocument | null> => {
  try {
    const lock = await lockFileService.read(lockPath)
    if (lock === null) {
      checks.push(
        failCheck(
          'lock_present',
          'agents-lock.json is missing',
          new LockValidationError('agents-lock.json is missing'),
        ),
      )
      return null
    }

    checks.push(passCheck('lock_present', 'agents-lock.json is present and valid'))
    return lock
  } catch (error) {
    checks.push(
      failCheck(
        'lock_present',
        error instanceof Error ? error.message : 'Lock validation failed',
        error,
      ),
    )
    return null
  }
}

const runDoctorLockConfigSyncCheck = (
  resolved: ResolvedAgentsConfig,
  lock: AgentsLockDocument | null,
  targetsConfiguredPassed: boolean,
  checks: DoctorCheck[],
): void => {
  if (lock === null) {
    checks.push(skipCheck('lock_config_sync', 'Skipped because lock is missing or invalid'))
    return
  }

  if (!targetsConfiguredPassed) {
    checks.push(skipCheck('lock_config_sync', 'Skipped because install targets are not configured'))
    return
  }

  try {
    runLockConfigSync(resolved, lock)
    checks.push(passCheck('lock_config_sync', 'Config and lock are in sync'))
  } catch (error) {
    checks.push(
      failCheck(
        'lock_config_sync',
        error instanceof Error ? error.message : 'Config and lock are out of sync',
        error,
      ),
    )
  }
}

const runDoctorArtifactChecks = async (options: {
  readonly resolved: ResolvedAgentsConfig
  readonly lock: AgentsLockDocument | null
  readonly catalogResult: RegistryCatalogLoadResult | undefined
  readonly checks: DoctorCheck[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly preferOnline: boolean
  readonly lockFileService: LockFileService
}): Promise<void> => {
  const lockSyncPassed = options.checks.some(
    (check) => check.id === 'lock_config_sync' && check.status === 'pass',
  )

  if (!lockSyncPassed || options.lock === null || options.catalogResult === undefined) {
    options.checks.push(
      skipCheck('legacy_path_encoding', 'Skipped because lock sync or registry checks did not pass'),
      skipCheck('agent_path_collision', 'Skipped because lock sync or registry checks did not pass'),
      skipCheck('install_paths', 'Skipped because lock sync or registry checks did not pass'),
    )
    return
  }

  const checkOptions = {
    resolved: options.resolved,
    lock: options.lock,
    catalogResult: options.catalogResult,
    cwd: options.cwd,
    env: options.env,
    preferOnline: options.preferOnline,
    parseIntegrityHex: (integrity: string) => options.lockFileService.parseIntegrityHex(integrity),
  }

  let artifacts: LockSlotArtifact[]
  try {
    artifacts = await loadLockSlotArtifacts(checkOptions)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Artifact download failed'
    options.checks.push(
      failCheck('legacy_path_encoding', message, error),
      failCheck('agent_path_collision', message, error),
      failCheck('install_paths', message, error),
    )
    return
  }

  try {
    verifyLegacyPathEncoding(options.lock, artifacts)
    options.checks.push(
      passCheck('legacy_path_encoding', 'Lock entries use qualified install path encoding'),
    )
  } catch (error) {
    options.checks.push(
      failCheck(
        'legacy_path_encoding',
        error instanceof Error ? error.message : 'Legacy path encoding check failed',
        error,
      ),
    )
  }

  try {
    verifyAgentPathCollisions(artifacts)
    options.checks.push(passCheck('agent_path_collision', 'No cross-package install path collisions'))
  } catch (error) {
    options.checks.push(
      failCheck(
        'agent_path_collision',
        error instanceof Error ? error.message : 'Install path collision check failed',
        error,
      ),
    )
  }

  try {
    const scope = resolveInstallScope({
      cwd: options.cwd,
      env: options.env,
      globalFlag: false,
    })
    verifyInstallPathsFromArtifacts(artifacts, scope.extractRoot)
    options.checks.push(passCheck('install_paths', 'Expected install paths exist on disk'))
  } catch (error) {
    options.checks.push(
      failCheck(
        'install_paths',
        error instanceof Error ? error.message : 'Install path verification failed',
        error,
      ),
    )
  }
}

export class DoctorService {
  private readonly configResolver = new ConfigResolver()
  private readonly lockFileService = new LockFileService()

  async run(options: DoctorServiceOptions = {}): Promise<DoctorResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const preferOnline = options.preferOnline === true
    const checks: DoctorCheck[] = []
    const warnings: string[] = []

    const resolved = await resolveDoctorConfig(this.configResolver, options, checks, warnings)
    if (resolved === undefined) {
      skipChecksAfterConfigFailure(checks)
      return {
        checks,
        warnings,
        exitCode: computeDoctorExitCode(checks),
      }
    }

    const targetsConfiguredPassed = runDoctorTargetsCheck(resolved, checks)
    const lock = await runDoctorLockCheck(this.lockFileService, resolved.lockPath, checks)
    runDoctorLockConfigSyncCheck(resolved, lock, targetsConfiguredPassed, checks)

    const catalogResult = await this.runRegistryCheck(
      checks,
      warnings,
      lock === null
        ? resolved.registry
        : {
            ...resolved.registry,
            ref: lock.resolvedRef,
          },
    )

    await runDoctorArtifactChecks({
      resolved,
      lock,
      catalogResult,
      checks,
      cwd,
      env,
      preferOnline,
      lockFileService: this.lockFileService,
    })

    return {
      checks,
      warnings,
      exitCode: computeDoctorExitCode(checks),
    }
  }

  private async runRegistryCheck(
    checks: DoctorCheck[],
    warnings: string[],
    registryConfig: ResolvedAgentsConfig['registry'],
  ): Promise<RegistryCatalogLoadResult | undefined> {
    try {
      const catalogResult = await loadRegistryCatalog(registryConfig)
      checks.push(passCheck('registry_reachable', 'Registry catalog is reachable'))
      warnings.push(...catalogResult.warnings)
      return catalogResult
    } catch (error) {
      checks.push(
        failCheck(
          'registry_reachable',
          error instanceof Error ? error.message : 'Registry is not reachable',
          error,
        ),
      )
      return undefined
    }
  }
}
