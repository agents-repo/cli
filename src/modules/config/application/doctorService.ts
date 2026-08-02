import { existsSync } from 'node:fs'

import { ConfigResolver } from './configResolver.js'
import { LockFileService } from './lockFileService.js'
import type { ResolvedAgentsConfig } from '../domain/agentsConfig.js'
import type { AgentsLockDocument } from '../domain/agentsLock.js'
import { ConfigError, LockValidationError } from '../domain/configErrors.js'
import { DEFAULT_REGISTRY_CONFIG } from '../../registry/infrastructure/registrySourceConfig.js'
import { RegistryError, RegistryFetchError } from '../../registry/domain/errors.js'
import {
  loadRegistryCatalog,
  type RegistryCatalogLoadResult,
} from '../../registry/infrastructure/registryRepository.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import { planFrozenInstallSlot } from '../../install/application/planFrozenInstallSlot.js'
import {
  validateCiConfigLockPackageSets,
  validateCiRequiredByTargetSlots,
} from '../../install/application/validateCiPrerequisites.js'
import { validateLockVersionRanges } from '../../install/application/validateLockVersionRanges.js'
import { resolveInstallScope } from '../../install/application/installScope.js'
import { resolveInstallTargets } from '../../install/application/resolveInstallTargets.js'
import { planArtifactExtractFromZip } from '../../install/infrastructure/artifactExtractPaths.js'
import { downloadArtifact } from '../../install/infrastructure/artifactDownloader.js'

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
}

const getErrorCode = (error: unknown): string | undefined => {
  if (error instanceof DoctorInstallPathsError) {
    return error.code
  }

  if (error instanceof ConfigError) {
    return error.code
  }

  if (error instanceof RegistryError) {
    return error.code
  }

  return undefined
}

export const exitCodeForDoctorError = (error: unknown): number => {
  if (error instanceof DoctorInstallPathsError) {
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

const verifyInstallPathsFromLock = async (options: {
  readonly resolved: ResolvedAgentsConfig
  readonly lock: AgentsLockDocument
  readonly catalogResult: RegistryCatalogLoadResult
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
}): Promise<void> => {
  const scope = resolveInstallScope({
    cwd: options.cwd,
    env: options.env,
    globalFlag: false,
  })
  const targets = resolveInstallTargets(options.resolved)
  const packageIds = Object.keys(options.resolved.packages).sort((left, right) =>
    left.localeCompare(right),
  )

  const missingPaths: string[] = []

  for (const target of targets) {
    for (const packageId of packageIds) {
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

      const zipBytes = await downloadArtifact(plan.artifactUrl)
      const extractPlan = planArtifactExtractFromZip(
        zipBytes,
        plan.target,
        plan.version,
        scope.extractRoot,
      )

      for (const absolutePath of extractPlan.absolutePaths) {
        if (!existsSync(absolutePath)) {
          missingPaths.push(absolutePath)
        }
      }
    }
  }

  if (missingPaths.length > 0) {
    const preview = missingPaths.slice(0, 5).join(', ')
    const suffix =
      missingPaths.length > 5 ? ` (+${missingPaths.length - 5} more)` : ''
    throw new DoctorInstallPathsError(
      `Missing ${missingPaths.length} expected install path(s): ${preview}${suffix}`,
    )
  }
}

export class DoctorService {
  private readonly configResolver = new ConfigResolver()
  private readonly lockFileService = new LockFileService()

  async run(options: DoctorServiceOptions = {}): Promise<DoctorResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const checks: DoctorCheck[] = []
    const warnings: string[] = []

    let resolved: ResolvedAgentsConfig | undefined

    try {
      resolved = await this.configResolver.resolve({
        cwd,
        env,
        globalScope: false,
        waiveConflicts: options.yes ?? false,
      })
      checks.push(passCheck('config_schema', 'agents.json resolved successfully'))
      for (const warning of resolved.warnings) {
        warnings.push(warning.message)
      }
    } catch (error) {
      checks.push(
        failCheck(
          'config_schema',
          error instanceof Error ? error.message : 'Config resolution failed',
          error,
        ),
      )
    }

    if (resolved === undefined) {
      checks.push(skipCheck('targets_configured', 'Skipped because config resolution failed'))
      checks.push(skipCheck('lock_present', 'Skipped because config resolution failed'))
      checks.push(skipCheck('lock_config_sync', 'Skipped because config resolution failed'))
      checks.push(skipCheck('install_paths', 'Skipped because config resolution failed'))
      await this.runRegistryCheck(checks, warnings, DEFAULT_REGISTRY_CONFIG)
      return {
        checks,
        warnings,
        exitCode: computeDoctorExitCode(checks),
      }
    }

    try {
      resolveInstallTargets(resolved)
      checks.push(passCheck('targets_configured', 'Install targets are configured'))
    } catch (error) {
      checks.push(
        failCheck(
          'targets_configured',
          error instanceof Error ? error.message : 'Install targets are not configured',
          error,
        ),
      )
    }

    let lock: AgentsLockDocument | null = null
    try {
      lock = await this.lockFileService.read(resolved.lockPath)
      if (lock === null) {
        checks.push(
          failCheck(
            'lock_present',
            'agents-lock.json is missing',
            new LockValidationError('agents-lock.json is missing'),
          ),
        )
      } else {
        checks.push(passCheck('lock_present', 'agents-lock.json is present and valid'))
      }
    } catch (error) {
      checks.push(
        failCheck(
          'lock_present',
          error instanceof Error ? error.message : 'Lock validation failed',
          error,
        ),
      )
    }

    if (lock === null) {
      checks.push(skipCheck('lock_config_sync', 'Skipped because lock is missing or invalid'))
    } else {
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

    const lockSyncPassed = checks.some(
      (check) => check.id === 'lock_config_sync' && check.status === 'pass',
    )

    if (!lockSyncPassed || lock === null || catalogResult === undefined) {
      checks.push(
        skipCheck(
          'install_paths',
          'Skipped because lock sync or registry checks did not pass',
        ),
      )
    } else {
      try {
        await verifyInstallPathsFromLock({
          resolved,
          lock,
          catalogResult,
          cwd,
          env,
        })
        checks.push(passCheck('install_paths', 'Expected install paths exist on disk'))
      } catch (error) {
        checks.push(
          failCheck(
            'install_paths',
            error instanceof Error ? error.message : 'Install path verification failed',
            error,
          ),
        )
      }
    }

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
