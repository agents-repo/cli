import type { RegistryConfig } from '../../registry/infrastructure/registrySourceConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'

import type { ConfigConflictRecord } from './configErrors.js'

export type SchemaGateMode = 'greenfield' | 'top-level-ours' | 'namespace'

export interface CliManagedConfig {
  readonly schemaVersion?: string
  readonly registry?: RegistryConfig
  readonly target?: InstallTargetId
  readonly packages?: Record<string, string>
  readonly global?: boolean
}

export type AgentsConfigDocument = Record<string, unknown>

export interface ResolvedAgentsConfig {
  readonly gateMode: SchemaGateMode
  readonly configPath: string
  readonly lockPath: string
  readonly schemaVersion?: string
  readonly registry: RegistryConfig
  readonly target?: InstallTargetId
  readonly packages: Record<string, string>
  readonly global: boolean
  readonly warnings: readonly ConfigConflictRecord[]
  readonly rawDocument: AgentsConfigDocument | null
}
