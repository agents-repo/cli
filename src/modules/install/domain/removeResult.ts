import type { InstallTargetId } from '../../registry/domain/package.js'

export interface RemoveResult {
  readonly packageId: string
  readonly version: string
  readonly target: InstallTargetId
  readonly extractRoot: string
  readonly artifactUrl: string
  readonly saved: boolean
  readonly dryRun: boolean
  readonly global: boolean
  readonly noSave: boolean
  readonly warnings: readonly string[]
  readonly deletedPaths: readonly string[]
}
