import type { SchemaGateMode } from '../domain/agentsConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { ConfigResolver } from './configResolver.js'

export type ShowTargetsScope = 'project' | 'global'

export interface ShowResolvedTargetsResult {
  readonly scope: ShowTargetsScope
  readonly rootPath: string
  readonly gateMode: SchemaGateMode
  readonly targets: readonly InstallTargetId[]
  readonly warnings: readonly string[]
}

export interface ShowResolvedTargetsServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly global?: boolean
  readonly yes?: boolean
}

export class ShowResolvedTargetsService {
  private readonly configResolver = new ConfigResolver()

  async run(options: ShowResolvedTargetsServiceOptions = {}): Promise<ShowResolvedTargetsResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const globalScope = options.global === true

    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      globalScope,
      waiveConflicts: options.yes ?? false,
    })

    const warnings = resolved.warnings.map((warning) => warning.message)
    const targets = resolved.targets ?? []

    return {
      scope: globalScope ? 'global' : 'project',
      rootPath: resolved.configRoot,
      gateMode: resolved.gateMode,
      targets,
      warnings,
    }
  }
}
