import type { PackageLockEntry } from './agentsLock.js'

export interface GlobalInstallStateDocument {
  readonly stateVersion: number
  readonly resolvedRef: string
  readonly packages: Record<string, PackageLockEntry>
}
