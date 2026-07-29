import { ConfigResolver } from './configResolver.js'
import { LockFileService } from './lockFileService.js'
import type { PackageLockEntry } from '../domain/agentsLock.js'
import { sortCanonicalInstallTargetIds } from '../domain/packageLockEntry.js'
import type { InstallTargetId } from '../../registry/domain/package.js'

export type ListInstallScope = 'project' | 'global'

export interface ListedPackage {
  readonly id: string
  readonly version: string
  readonly target: InstallTargetId
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

  async run(options: ListInstalledServiceOptions = {}): Promise<ListInstalledResult> {
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
    const rootPath = resolved.configRoot
    const lock = await this.lockFileService.read(resolved.lockPath)

    if (lock === null) {
      return {
        scope: globalScope ? 'global' : 'project',
        rootPath,
        packages: [],
        warnings,
      }
    }

    const incompleteTargetWarnings = this.incompleteByTargetWarnings(
      lock.packages,
      resolved.targets,
    )
    const packages = this.lockEntriesToListedPackages(lock.packages, resolved.packages)

    return {
      scope: globalScope ? 'global' : 'project',
      rootPath,
      resolvedRef: lock.resolvedRef,
      packages,
      warnings: [...warnings, ...incompleteTargetWarnings],
    }
  }

  private incompleteByTargetWarnings(
    entries: Record<string, PackageLockEntry>,
    configuredTargets: readonly InstallTargetId[] | undefined,
  ): string[] {
    if (configuredTargets === undefined) {
      return []
    }

    const packageIds = Object.keys(entries).sort((left, right) => left.localeCompare(right))
    const warnings: string[] = []

    for (const packageId of packageIds) {
      const entry = entries[packageId]
      for (const targetId of configuredTargets) {
        if (entry.byTarget[targetId] === undefined) {
          warnings.push(
            `${packageId}: missing byTarget slot for configured target ${targetId}`,
          )
        }
      }
    }

    return warnings
  }

  private lockEntriesToListedPackages(
    entries: Record<string, PackageLockEntry>,
    declaredRanges?: Record<string, string>,
  ): ListedPackage[] {
    const ids = Object.keys(entries).sort((left, right) => left.localeCompare(right))
    const listed: ListedPackage[] = []

    for (const id of ids) {
      const entry = entries[id]
      const targetIds = sortCanonicalInstallTargetIds(
        Object.keys(entry.byTarget) as InstallTargetId[],
      )

      for (const target of targetIds) {
        const slot = entry.byTarget[target]
        if (slot === undefined) {
          continue
        }

        const range = declaredRanges?.[id]
        listed.push({
          id,
          version: entry.version,
          target,
          integrity: slot.integrity,
          artifact: slot.artifact,
          ...(range === undefined ? {} : { range }),
        })
      }
    }

    return listed
  }
}
