import type { InstallTargetId } from '../../registry/domain/package.js'
import type { ConfigConflictRecord } from './configErrors.js'
import type { SchemaGateMode } from './agentsConfig.js'

export interface InitResult {
  readonly configPath: string
  readonly gateMode: SchemaGateMode
  readonly target: InstallTargetId | undefined
  readonly warnings: readonly ConfigConflictRecord[]
  readonly created: boolean
}
