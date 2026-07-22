import {
  INSTALL_TARGET_IDS,
  type InstallTargetId,
} from '../domain/package.js'
import {
  METADATA_INSTALL_TARGET_STATUSES,
  type MetadataCompatibilityTarget,
  type PackageCompatibility,
  type PackageMetadata,
} from '../domain/packageMetadata.js'
import { MetadataSchemaError } from '../domain/errors.js'
import { isPlainObject } from '../../config/infrastructure/jsonDocument.js'

const DEFAULT_CANONICAL_FORMAT = 'agents-repo.agent-instruction@1.0.0'

const DEFAULT_TARGETS: MetadataCompatibilityTarget[] = INSTALL_TARGET_IDS.map((id) => ({
  id,
  status: 'supported',
}))

const isInstallTargetId = (value: unknown): value is InstallTargetId => {
  return typeof value === 'string' && (INSTALL_TARGET_IDS as readonly string[]).includes(value)
}

const isMetadataInstallTargetStatus = (
  value: unknown,
): value is MetadataCompatibilityTarget['status'] => {
  return (
    typeof value === 'string' &&
    (METADATA_INSTALL_TARGET_STATUSES as readonly string[]).includes(value)
  )
}

const parseCompatibilityObject = (value: unknown): PackageCompatibility => {
  if (!isPlainObject(value)) {
    throw new MetadataSchemaError('metadata.json compatibility must be an object when provided')
  }

  const canonicalFormatValue = value.canonicalFormat
  const canonicalFormat =
    typeof canonicalFormatValue === 'string' && canonicalFormatValue.trim().length > 0
      ? canonicalFormatValue
      : DEFAULT_CANONICAL_FORMAT

  const rawTargets = value.targets
  if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
    throw new MetadataSchemaError('metadata.json compatibility.targets must be a non-empty array')
  }

  const targets: MetadataCompatibilityTarget[] = []
  const seen = new Set<string>()

  for (const entry of rawTargets) {
    if (!isPlainObject(entry)) {
      throw new MetadataSchemaError('metadata.json compatibility.targets entries must be objects')
    }

    const id = entry.id
    const status = entry.status

    if (!isInstallTargetId(id)) {
      throw new MetadataSchemaError(
        `metadata.json compatibility.targets id must be one of: ${INSTALL_TARGET_IDS.join(', ')}`,
      )
    }

    if (!isMetadataInstallTargetStatus(status)) {
      throw new MetadataSchemaError(
        'metadata.json compatibility.targets status must be supported, experimental, or planned',
      )
    }

    if (seen.has(id)) {
      throw new MetadataSchemaError(`metadata.json compatibility.targets contains duplicate id: ${id}`)
    }

    seen.add(id)
    targets.push({ id, status })
  }

  return { canonicalFormat, targets }
}

export const resolvePackageCompatibility = (metadata: PackageMetadata): PackageCompatibility => {
  if (metadata.compatibility === undefined) {
    return {
      canonicalFormat: DEFAULT_CANONICAL_FORMAT,
      targets: DEFAULT_TARGETS,
    }
  }

  return metadata.compatibility
}

export const isPackageMetadata = (value: unknown): value is PackageMetadata => {
  if (!isPlainObject(value)) {
    return false
  }

  return (
    typeof value.schemaVersion === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.license === 'string' &&
    typeof value.version === 'string' &&
    (value.compatibility === undefined || isPlainObject(value.compatibility))
  )
}

export const parsePackageMetadata = (value: unknown): PackageMetadata => {
  if (!isPackageMetadata(value)) {
    throw new MetadataSchemaError('Metadata payload does not match expected schema')
  }

  const compatibility =
    value.compatibility === undefined ? undefined : parseCompatibilityObject(value.compatibility)

  return {
    schemaVersion: value.schemaVersion,
    name: value.name,
    description: value.description,
    owner: value.owner,
    license: value.license,
    version: value.version,
    compatibility,
  }
}
