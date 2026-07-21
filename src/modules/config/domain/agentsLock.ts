import type { InstallTargetId } from '../../registry/domain/package.js'

export interface PackageLockEntry {
  readonly version: string
  readonly target: InstallTargetId
  readonly integrity: string
  readonly artifact: string
  readonly resolved?: string
}

export interface AgentsLockDocument {
  readonly lockfileVersion: number
  readonly resolvedRef: string
  readonly packages: Record<string, PackageLockEntry>
}
