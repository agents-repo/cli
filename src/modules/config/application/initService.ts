import type { InstallTargetId } from '../../registry/domain/package.js'
import { ProjectTargetDetector } from '../../target/application/projectTargetDetector.js'
import type { TargetDetectionResult } from '../../target/domain/targetDetection.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import type { InitResult } from '../domain/initResult.js'
import { AgentsJsonRepository } from '../infrastructure/agentsJsonRepository.js'
import { resolveConfigPaths } from '../infrastructure/configPaths.js'
import { extractCliManagedConfig } from './cliManagedSlice.js'
import { ConfigMerger } from './configMerger.js'
import { ConflictDetector } from './conflictDetector.js'
import {
  installTargetSetsEqual,
  parseInstallTargetsArray,
  resolveTargetsFromManaged,
} from './resolveTargets.js'
import { SchemaGate, getActiveGateTarget, getNamespaceBlock } from './schemaGate.js'

export interface InitServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly force?: boolean
  readonly yes?: boolean
  /** Explicit target ids from CLI (`--targets` / `--target` variadic). */
  readonly targetIds?: readonly string[]
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

    const { configPath } = resolveConfigPaths(cwd, env)
    const rawDocument = await this.agentsJsonRepository.read(configPath)
    const gateMode = this.schemaGate.determineMode(rawDocument)
    const created =
      rawDocument === null ||
      (gateMode === 'greenfield' && Object.keys(rawDocument).length === 0)

    let warnings: InitResult['warnings'] = []
    if (rawDocument !== null) {
      if (gateMode === 'top-level-ours') {
        this.conflictDetector.detectOrThrow(rawDocument, gateMode, { waiveConflicts: yes })
      } else {
        warnings = this.conflictDetector.detectOrThrow(rawDocument, gateMode, {
          waiveConflicts: yes,
        })
      }
    }

    const activeTarget =
      rawDocument === null ? {} : getActiveGateTarget(rawDocument, gateMode)
    const existingManaged = extractCliManagedConfig(activeTarget)
    const namespaceManaged =
      rawDocument === null || gateMode !== 'top-level-ours'
        ? {}
        : extractCliManagedConfig(getNamespaceBlock(rawDocument) ?? {})

    const existingTargets = resolveTargetsFromManaged(existingManaged)
    const namespaceTargets = resolveTargetsFromManaged(namespaceManaged)
    const effectiveTargets = resolveTargetsFromManaged({
      ...namespaceManaged,
      ...existingManaged,
      targets: existingManaged.targets ?? namespaceManaged.targets,
    })

    const resolvedTargets = await this.resolveTargets({
      cwd,
      force,
      cliTargetIds: options.targetIds,
      existingTargets: effectiveTargets,
      topTargets: existingTargets,
      namespaceTargets,
    })

    const patch: {
      targets?: InstallTargetId[]
    } = {}
    if (resolvedTargets !== undefined) {
      patch.targets = resolvedTargets
    }

    const merged = this.configMerger.merge(rawDocument, patch, { gateMode, force })

    const finalWarnings =
      rawDocument !== null && gateMode === 'top-level-ours'
        ? this.conflictDetector.detectOrThrow(merged, gateMode, { waiveConflicts: yes })
        : warnings

    await this.agentsJsonRepository.write(configPath, merged)

    const mergedActive =
      getActiveGateTarget(merged, gateMode)
    const finalTargets = resolveTargetsFromManaged(extractCliManagedConfig(mergedActive))

    return {
      configPath,
      gateMode,
      targets: finalTargets,
      warnings: finalWarnings,
      created,
    }
  }

  private parseCliTargetIds(raw: readonly string[] | undefined): InstallTargetId[] | undefined {
    if (raw === undefined || raw.length === 0) {
      return undefined
    }

    return parseInstallTargetsArray(raw, '--targets')
  }

  private async resolveTargets(options: {
    readonly cwd: string
    readonly force: boolean
    readonly cliTargetIds?: readonly string[]
    readonly existingTargets?: InstallTargetId[]
    readonly topTargets?: InstallTargetId[]
    readonly namespaceTargets?: InstallTargetId[]
  }): Promise<InstallTargetId[] | undefined> {
    const {
      cwd,
      force,
      cliTargetIds,
      existingTargets,
      topTargets,
      namespaceTargets,
    } = options

    const fromCli = this.parseCliTargetIds(cliTargetIds)

    if (fromCli !== undefined) {
      if (
        existingTargets !== undefined &&
        !installTargetSetsEqual(existingTargets, fromCli) &&
        !force
      ) {
        throw new ConfigValidationError(
          `Install targets are already set to [${existingTargets.join(', ')}]; use --force to change them`,
          'target_mismatch',
        )
      }

      if (topTargets !== undefined && installTargetSetsEqual(topTargets, fromCli)) {
        return undefined
      }

      return fromCli
    }

    if (topTargets !== undefined) {
      return undefined
    }

    if (namespaceTargets !== undefined) {
      return namespaceTargets
    }

    const detection = await this.targetDetector.detect(cwd)
    return this.targetsFromDetection(detection)
  }

  private targetsFromDetection(detection: TargetDetectionResult): InstallTargetId[] {
    if (detection.status === 'single' && detection.suggestedTarget !== undefined) {
      return [detection.suggestedTarget]
    }

    if (detection.status === 'ambiguous') {
      return parseInstallTargetsArray(detection.detected, 'detected targets')
    }

    throw new ConfigValidationError(
      'Install target could not be detected; pass --targets <id...> to set one or more.',
      'missing_target',
    )
  }
}
