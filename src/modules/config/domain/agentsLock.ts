import type { NormalizedPackageLockEntry } from './packageLockEntry.js'

export type PackageLockEntry = NormalizedPackageLockEntry

export interface AgentsLockDocument {
  readonly lockfileVersion: number
  readonly resolvedRef: string
  readonly packages: Record<string, NormalizedPackageLockEntry>
}

export type { NormalizedPackageLockEntry, TargetLockSlot } from './packageLockEntry.js'
