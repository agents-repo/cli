import type { InstallTargetId } from '../../registry/domain/package.js'

export type TargetDetectionStatus = 'none' | 'single' | 'ambiguous'

export interface TargetDetectionMatch {
  readonly target: InstallTargetId
  readonly markers: readonly string[]
}

export interface TargetDetectionResult {
  readonly status: TargetDetectionStatus
  readonly detected: readonly InstallTargetId[]
  readonly matches: readonly TargetDetectionMatch[]
  readonly suggestedTarget?: InstallTargetId
}
