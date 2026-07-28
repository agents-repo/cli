import type { InstallTargetId } from '../../registry/domain/package.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import { AgentsJsonRepository } from '../infrastructure/agentsJsonRepository.js'
import { resolveProjectConfigPaths } from '../infrastructure/configPaths.js'
import { sortCanonicalInstallTargetIds } from '../domain/packageLockEntry.js'
import { extractCliManagedConfig } from './cliManagedSlice.js'
import { ConfigMerger } from './configMerger.js'
import { ConflictDetector } from './conflictDetector.js'
import { parseInstallTargetsArray, resolveTargetsFromManaged } from './resolveTargets.js'
import { SchemaGate, getActiveGateTarget } from './schemaGate.js'

export interface AddTargetResult {
  readonly configPath: string
  readonly targets: InstallTargetId[]
  readonly warnings: string[]
  readonly changed: boolean
}

export interface AddTargetServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly targetIds: readonly string[]
  readonly yes?: boolean
}

export class AddTargetService {
  private readonly schemaGate = new SchemaGate()
  private readonly conflictDetector = new ConflictDetector()
  private readonly configMerger = new ConfigMerger()
  private readonly agentsJsonRepository = new AgentsJsonRepository()

  async run(options: AddTargetServiceOptions): Promise<AddTargetResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const { configPath } = resolveProjectConfigPaths(cwd, env)

    const rawDocument = await this.agentsJsonRepository.read(configPath)
    if (rawDocument === null) {
      throw new ConfigValidationError(
        'agents.json is missing; run init or install <package-id> first',
        'missing_config',
      )
    }

    const gateMode = this.schemaGate.determineMode(rawDocument)
    const warnings: string[] = []

    if (gateMode === 'top-level-ours') {
      this.conflictDetector.detectOrThrow(rawDocument, gateMode, {
        waiveConflicts: options.yes ?? false,
      })
    } else {
      const detected = this.conflictDetector.detectOrThrow(rawDocument, gateMode, {
        waiveConflicts: options.yes ?? false,
      })
      warnings.push(...detected.map((warning) => warning.message))
    }

    const newIds = parseInstallTargetsArray(options.targetIds, 'add-target')
    const activeTarget = getActiveGateTarget(rawDocument, gateMode)
    const managed = extractCliManagedConfig(activeTarget)
    const existing = resolveTargetsFromManaged(managed) ?? []

    const existingSet = new Set(existing)
    const toAppend: InstallTargetId[] = []

    for (const id of newIds) {
      if (existingSet.has(id)) {
        warnings.push(`target already configured: ${id}`)
        continue
      }
      toAppend.push(id)
      existingSet.add(id)
    }

    if (toAppend.length === 0) {
      return {
        configPath,
        targets: existing,
        warnings,
        changed: false,
      }
    }

    const mergedTargets = sortCanonicalInstallTargetIds([...existing, ...toAppend])

    const merged = this.configMerger.merge(
      rawDocument,
      { targets: mergedTargets },
      { gateMode, force: true },
    )

    await this.agentsJsonRepository.write(configPath, merged)

    return {
      configPath,
      targets: mergedTargets,
      warnings,
      changed: true,
    }
  }
}
