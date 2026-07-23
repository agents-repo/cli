import type { InstallTargetId } from './package.js'

export const METADATA_INSTALL_TARGET_STATUSES = ['supported', 'experimental', 'planned'] as const
export type MetadataInstallTargetStatus = (typeof METADATA_INSTALL_TARGET_STATUSES)[number]

export interface MetadataCompatibilityTarget {
  readonly id: InstallTargetId
  readonly status: MetadataInstallTargetStatus
}

export interface PackageCompatibility {
  readonly canonicalFormat: string
  readonly targets: readonly MetadataCompatibilityTarget[]
}

export interface PackageMetadata {
  readonly schemaVersion: string
  readonly name: string
  readonly description: string
  readonly owner: string
  readonly license: string
  readonly version: string
  readonly compatibility?: PackageCompatibility
}
