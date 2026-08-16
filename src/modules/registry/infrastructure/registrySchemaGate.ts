import semver from 'semver'

import { IndexSchemaError, ManifestSchemaError } from '../domain/errors.js'
import { INDEX_SCHEMA_VERSIONS, MANIFEST_SCHEMA_VERSIONS } from '../domain/schemaVersions.js'

export interface SchemaGateResult {
  warnings: string[]
}

interface SchemaLifecycle {
  readonly current: string
  readonly supported: readonly string[]
  readonly deprecated: readonly string[]
  readonly eol: readonly string[]
}

const includesVersion = (versions: readonly string[], schemaVersion: string): boolean => {
  return versions.includes(schemaVersion)
}

const isSameMajorNewer = (schemaVersion: string, current: string): boolean => {
  const parsed = semver.valid(schemaVersion)
  if (parsed === null) {
    return false
  }

  return semver.major(parsed) === semver.major(current) && semver.gt(parsed, current)
}

const classifySchemaVersion = (
  schemaVersion: string,
  lifecycle: SchemaLifecycle,
  options: {
    readonly kind: 'index' | 'manifest'
    readonly deprecatedWarning: string
    readonly newerWarning: string
    readonly ErrorClass: typeof IndexSchemaError | typeof ManifestSchemaError
  },
): SchemaGateResult => {
  const warnings: string[] = []
  const label = options.kind

  if (includesVersion(lifecycle.eol, schemaVersion)) {
    throw new options.ErrorClass(
      `Unsupported ${label} schemaVersion "${schemaVersion}" (end-of-life)`,
      schemaVersion,
    )
  }

  if (includesVersion(lifecycle.supported, schemaVersion)) {
    if (includesVersion(lifecycle.deprecated, schemaVersion)) {
      warnings.push(options.deprecatedWarning)
    }

    return { warnings }
  }

  if (isSameMajorNewer(schemaVersion, lifecycle.current)) {
    warnings.push(options.newerWarning)
    return { warnings }
  }

  throw new options.ErrorClass(`Unsupported ${label} schemaVersion "${schemaVersion}"`, schemaVersion)
}

export const assertIndexSchemaVersion = (schemaVersion: string): SchemaGateResult => {
  return classifySchemaVersion(schemaVersion, INDEX_SCHEMA_VERSIONS, {
    kind: 'index',
    deprecatedWarning: `Index schemaVersion "${schemaVersion}" is deprecated; consider upgrading catalog consumers`,
    newerWarning: `Index schemaVersion "${schemaVersion}" is newer than this CLI; consider upgrading agents-repo`,
    ErrorClass: IndexSchemaError,
  })
}

export const assertManifestSchemaVersion = (schemaVersion: string): SchemaGateResult => {
  return classifySchemaVersion(schemaVersion, MANIFEST_SCHEMA_VERSIONS, {
    kind: 'manifest',
    deprecatedWarning: `Manifest schemaVersion "${schemaVersion}" is deprecated; consider upgrading agents-repo`,
    newerWarning: `Manifest schemaVersion "${schemaVersion}" is newer than this CLI; consider upgrading agents-repo`,
    ErrorClass: ManifestSchemaError,
  })
}
