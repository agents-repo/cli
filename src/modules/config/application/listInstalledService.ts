import path from 'node:path'

import { ConfigResolver } from './configResolver.js'
import { GlobalInstallStateService } from './globalInstallStateService.js'
import { LockFileService } from './lockFileService.js'
import type { PackageLockEntry } from '../domain/agentsLock.js'
import {
  resolveGlobalInstallConfigDir,
  resolveGlobalInstallStatePath,
} from '../infrastructure/globalInstallStatePaths.js'

export type ListInstallScope = 'project' | 'global'

export interface ListedPackage {
  readonly id: string
  readonly version: string
  readonly target: PackageLockEntry['target']
  readonly integrity: string
  readonly artifact: string
  readonly range?: string
}

export interface ListInstalledResult {
  readonly scope: ListInstallScope
  readonly rootPath: string
  readonly resolvedRef?: string
  readonly packages: readonly ListedPackage[]
  readonly warnings: readonly string[]
}

export interface ListInstalledServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly global?: boolean
  readonly yes?: boolean
}

export class ListInstalledService {
  private readonly configResolver = new ConfigResolver()
  private readonly lockFileService = new LockFileService()
  private readonly globalInstallStateService = new GlobalInstallStateService()

  async run(options: ListInstalledServiceOptions = {}): Promise<ListInstalledResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const globalScope = options.global === true

    if (globalScope) {
      return this.runGlobal(env)
    }

    return this.runProject(cwd, env, options.yes ?? false)
  }

  private async runGlobal(env: NodeJS.ProcessEnv): Promise<ListInstalledResult> {
    const statePath = resolveGlobalInstallStatePath(env)
    const rootPath = resolveGlobalInstallConfigDir(env)
    const state = await this.globalInstallStateService.read(statePath)

    if (state === null) {
      return {
        scope: 'global',
        rootPath,
        packages: [],
        warnings: [],
      }
    }

    return {
      scope: 'global',
      rootPath,
      resolvedRef: state.resolvedRef,
      packages: this.lockEntriesToListedPackages(state.packages),
      warnings: [],
    }
  }

  private async runProject(
    cwd: string,
    env: NodeJS.ProcessEnv,
    waiveConflicts: boolean,
  ): Promise<ListInstalledResult> {
    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      waiveConflicts,
    })

    const warnings = resolved.warnings.map((warning) => warning.message)
    const rootPath = path.dirname(resolved.configPath)
    const lock = await this.lockFileService.read(resolved.lockPath)

    if (lock === null) {
      return {
        scope: 'project',
        rootPath,
        packages: [],
        warnings,
      }
    }

    const packages = this.lockEntriesToListedPackages(lock.packages, resolved.packages)

    return {
      scope: 'project',
      rootPath,
      resolvedRef: lock.resolvedRef,
      packages,
      warnings,
    }
  }

  private lockEntriesToListedPackages(
    entries: Record<string, PackageLockEntry>,
    declaredRanges?: Record<string, string>,
  ): ListedPackage[] {
    const ids = Object.keys(entries).sort((left, right) => left.localeCompare(right))

    return ids.map((id) => {
      const entry = entries[id]
      const range = declaredRanges?.[id]
      return {
        id,
        version: entry.version,
        target: entry.target,
        integrity: entry.integrity,
        artifact: entry.artifact,
        ...(range === undefined ? {} : { range }),
      }
    })
  }
}
