import type { RegistryCatalog } from '../domain/package.js'
import { ManifestSchemaError, RegistryCatalogValidationError, RegistryFetchError } from '../domain/errors.js'
import type { PackageManifest } from '../domain/manifest.js'
import type { PackageMetadata } from '../domain/packageMetadata.js'
import { parsePackageMetadata } from './registryMetadataValidation.js'
import { isRegistryCatalog } from './registryCatalogValidation.js'
import { isPackageManifest } from './registryManifestValidation.js'
import { assertIndexSchemaVersion, assertManifestSchemaVersion } from './registrySchemaGate.js'
import {
  buildRegistryManifestUrl,
  buildRegistryVersionMetadataUrl,
  getRegistryBaseUrlFromIndexUrl,
} from './registrySourceUrl.js'
import {
  resolveRegistryFetchSourceConfig,
  type RegistryConfig,
  type RegistryRefResolution,
  DEFAULT_REGISTRY_CONFIG,
} from './registrySourceConfig.js'

export interface RegistryCatalogLoadResult {
  catalog: RegistryCatalog
  indexUrl: string
  registryBaseUrl: string
  baseUrlRefResolution: RegistryRefResolution | null
  warnings: string[]
}

export interface PackageManifestLoadResult {
  manifest: PackageManifest
  warnings: string[]
}

export interface LoadRegistryCatalogOptions {
  readonly signal?: AbortSignal
  readonly bypassTagCache?: boolean
}

const fetchJson = async (url: string, signal: AbortSignal | undefined): Promise<unknown> => {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new RegistryFetchError(
      `Registry request failed (${response.status} ${response.statusText})`,
      response.status,
    )
  }

  return response.json()
}

const readSchemaVersionString = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null || !('schemaVersion' in payload)) {
    return undefined
  }

  const { schemaVersion } = payload
  return typeof schemaVersion === 'string' ? schemaVersion : undefined
}

export const loadRegistryCatalog = async (
  config: RegistryConfig = DEFAULT_REGISTRY_CONFIG,
  options: LoadRegistryCatalogOptions = {},
): Promise<RegistryCatalogLoadResult> => {
  const fetchSourceConfig = await resolveRegistryFetchSourceConfig(config, options)
  const { indexUrl, indexPath, baseUrlRefResolution } = fetchSourceConfig
  const registryBaseUrl = getRegistryBaseUrlFromIndexUrl(indexUrl, indexPath)

  let payload: unknown

  try {
    payload = await fetchJson(indexUrl, options.signal)
  } catch (error) {
    if (error instanceof RegistryFetchError) {
      throw error
    }

    throw new RegistryFetchError(
      error instanceof Error ? error.message : 'Unknown registry loading error',
    )
  }

  const schemaVersion = readSchemaVersionString(payload)
  const warnings =
    schemaVersion === undefined ? [] : assertIndexSchemaVersion(schemaVersion).warnings

  if (!isRegistryCatalog(payload)) {
    throw new RegistryCatalogValidationError('Registry payload does not match expected catalog schema')
  }

  return {
    catalog: payload,
    indexUrl,
    registryBaseUrl,
    baseUrlRefResolution,
    warnings,
  }
}

export const loadPackageManifest = async (
  registryBaseUrl: string,
  namespace: string,
  packageId: string,
  options: { signal?: AbortSignal } = {},
): Promise<PackageManifestLoadResult> => {
  const manifestUrl = buildRegistryManifestUrl(registryBaseUrl, namespace, packageId)

  let payload: unknown

  try {
    payload = await fetchJson(manifestUrl, options.signal)
  } catch (error) {
    if (error instanceof RegistryFetchError) {
      throw error
    }

    throw new RegistryFetchError(
      error instanceof Error ? error.message : 'Unknown manifest loading error',
    )
  }

  const schemaVersion = readSchemaVersionString(payload)
  const warnings =
    schemaVersion === undefined ? [] : assertManifestSchemaVersion(schemaVersion).warnings

  if (!isPackageManifest(payload)) {
    throw new ManifestSchemaError('Manifest payload does not match expected schema')
  }

  return {
    manifest: payload,
    warnings,
  }
}

export const loadPackageMetadata = async (
  registryBaseUrl: string,
  namespace: string,
  packageId: string,
  version: string,
  options: { signal?: AbortSignal } = {},
): Promise<PackageMetadata> => {
  const metadataUrl = buildRegistryVersionMetadataUrl(registryBaseUrl, namespace, packageId, version)

  let payload: unknown

  try {
    payload = await fetchJson(metadataUrl, options.signal)
  } catch (error) {
    if (error instanceof RegistryFetchError) {
      throw error
    }

    throw new RegistryFetchError(
      error instanceof Error ? error.message : 'Unknown metadata loading error',
    )
  }

  return parsePackageMetadata(payload)
}
