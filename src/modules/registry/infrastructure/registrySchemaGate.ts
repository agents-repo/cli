import { IndexSchemaError, ManifestSchemaError } from '../domain/errors.js'
import { INDEX_SCHEMA_VERSIONS, MANIFEST_SCHEMA_VERSIONS } from '../domain/schemaVersions.js'

export interface SchemaGateResult {
  warnings: string[]
}

const includesVersion = (versions: readonly string[], schemaVersion: string): boolean => {
  return versions.includes(schemaVersion)
}

export const assertIndexSchemaVersion = (schemaVersion: string): SchemaGateResult => {
  const warnings: string[] = []

  if (includesVersion(INDEX_SCHEMA_VERSIONS.eol, schemaVersion)) {
    throw new IndexSchemaError(
      `Unsupported index schemaVersion "${schemaVersion}" (end-of-life)`,
      schemaVersion,
    )
  }

  if (!includesVersion(INDEX_SCHEMA_VERSIONS.supported, schemaVersion)) {
    throw new IndexSchemaError(
      `Unsupported index schemaVersion "${schemaVersion}"`,
      schemaVersion,
    )
  }

  if (includesVersion(INDEX_SCHEMA_VERSIONS.deprecated, schemaVersion)) {
    warnings.push(
      `Index schemaVersion "${schemaVersion}" is deprecated; consider upgrading catalog consumers`,
    )
  }

  return { warnings }
}

export const assertManifestSchemaVersion = (schemaVersion: string): void => {
  if (includesVersion(MANIFEST_SCHEMA_VERSIONS.eol, schemaVersion)) {
    throw new ManifestSchemaError(
      `Unsupported manifest schemaVersion "${schemaVersion}" (end-of-life)`,
      schemaVersion,
    )
  }

  if (!includesVersion(MANIFEST_SCHEMA_VERSIONS.supported, schemaVersion)) {
    throw new ManifestSchemaError(
      `Unsupported manifest schemaVersion "${schemaVersion}"`,
      schemaVersion,
    )
  }
}
