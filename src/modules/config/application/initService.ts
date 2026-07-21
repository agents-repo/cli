import type { InstallTargetId } from '../../registry/domain/package.js'
import { ProjectTargetDetector } from '../../target/application/projectTargetDetector.js'
import type { TargetDetectionResult } from '../../target/domain/targetDetection.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import type { InitResult } from '../domain/initResult.js'
import { isValidInstallTargetId } from '../domain/validators.js'
import { AgentsJsonRepository } from '../infrastructure/agentsJsonRepository.js'
import { resolveConfigPaths } from '../infrastructure/configPaths.js'
import { extractCliManagedConfig } from './cliManagedSlice.js'
import { ConfigMerger } from './configMerger.js'
import { ConflictDetector } from './conflictDetector.js'
import { SchemaGate, getActiveGateTarget, getNamespaceBlock } from './schemaGate.js'

export interface InitServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly force?: boolean
  readonly yes?: boolean
  readonly target?: string
  readonly verbose?: boolean
}

export class InitService {
  private readonly schemaGate = new SchemaGate()
  private readonly conflictDetector = new ConflictDetector()
  private readonly configMerger = new ConfigMerger()
  private readonly agentsJsonRepository = new AgentsJsonRepository()
  private readonly targetDetector: ProjectTargetDetector

  constructor(targetDetector: ProjectTargetDetector = new ProjectTargetDetector()) {
    this.targetDetector = targetDetector
  }

  async run(options: InitServiceOptions = {}): Promise<InitResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const force = options.force ?? false
    const yes = options.yes ?? false
    const verbose = options.verbose ?? false

    const { configPath } = resolveConfigPaths(cwd, env)
    const rawDocument = await this.agentsJsonRepository.read(configPath)
    const gateMode = this.schemaGate.determineMode(rawDocument)
    const created =
      rawDocument === null ||
      (gateMode === 'greenfield' && Object.keys(rawDocument).length === 0)

    const warnings =
      rawDocument === null
        ? []
        : this.conflictDetector.detectOrThrow(rawDocument, gateMode, { waiveConflicts: yes })

    const activeTarget =
      rawDocument === null ? {} : getActiveGateTarget(rawDocument, gateMode)
    const existingManaged = extractCliManagedConfig(activeTarget)
    const namespaceManaged =
      rawDocument === null || gateMode !== 'top-level-ours'
        ? {}
        : extractCliManagedConfig(getNamespaceBlock(rawDocument) ?? {})

    const topTarget = existingManaged.target
    const namespaceTarget = namespaceManaged.target

    const resolvedTarget = await this.resolveTarget({
      cwd,
      force,
      verbose,
      targetOption: options.target,
      existingTarget: topTarget ?? namespaceTarget,
      topTarget,
      namespaceTarget,
    })

    const patch: {
      target?: InstallTargetId
    } = {}
    if (resolvedTarget !== undefined) {
      patch.target = resolvedTarget
    }

    const merged = this.configMerger.merge(rawDocument, patch, { gateMode, force })

    const postMergeWarnings =
      rawDocument !== null && gateMode === 'top-level-ours'
        ? this.conflictDetector.detectOrThrow(merged, gateMode, { waiveConflicts: yes })
        : []

    await this.agentsJsonRepository.write(configPath, merged)

    const finalTarget = resolvedTarget ?? topTarget ?? namespaceTarget

    return {
      configPath,
      gateMode,
      target: finalTarget,
      warnings: [...warnings, ...postMergeWarnings],
      created,
    }
  }

  private async resolveTarget(options: {
    readonly cwd: string
    readonly force: boolean
    readonly verbose: boolean
    readonly targetOption?: string
    readonly existingTarget?: InstallTargetId
    readonly topTarget?: InstallTargetId
    readonly namespaceTarget?: InstallTargetId
  }): Promise<InstallTargetId | undefined> {
    const { cwd, force, verbose, targetOption, existingTarget, topTarget, namespaceTarget } = options

    if (targetOption !== undefined) {
      if (!isValidInstallTargetId(targetOption)) {
        throw new ConfigValidationError(
          `Invalid install target id: ${targetOption}`,
          'invalid_enum',
        )
      }

      if (existingTarget !== undefined && existingTarget !== targetOption && !force) {
        throw new ConfigValidationError(
          `Install target is already set to "${existingTarget}"; use --force to change it to "${targetOption}"`,
          'target_mismatch',
        )
      }

      if (topTarget === targetOption) {
        return undefined
      }

      return targetOption
    }

    if (topTarget !== undefined) {
      return undefined
    }

    if (namespaceTarget !== undefined) {
      return namespaceTarget
    }

    const detection = await this.targetDetector.detect(cwd)
    return this.targetFromDetection(detection, verbose)
  }

  private targetFromDetection(
    detection: TargetDetectionResult,
    verbose: boolean,
  ): InstallTargetId {
    if (detection.status === 'single' && detection.suggestedTarget !== undefined) {
      return detection.suggestedTarget
    }

    if (detection.status === 'ambiguous') {
      const detectedList = detection.detected.join(', ')
      const matchDetails = detection.matches
        .map((match) => `${match.target} (${match.markers.join(', ')})`)
        .join('; ')
      const verboseSuffix = verbose ? ` Matches: ${matchDetails}.` : ''
      throw new ConfigValidationError(
        `Multiple install targets detected (${detectedList}); pass --target <id> to choose one.${verboseSuffix}`,
        'missing_target',
      )
    }

    throw new ConfigValidationError(
      'Install target could not be detected; pass --target <id> to set one.',
      'missing_target',
    )
  }
}
