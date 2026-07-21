import { DEFAULT_REGISTRY_CONFIG } from '../../registry/infrastructure/registrySourceConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { DEFAULT_REGISTRY_REF } from '../domain/configConstants.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import type { CliManagedConfig } from '../domain/agentsConfig.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'
import { getRegistryRefDefault, getRegistryUrlAlias } from './schemaGate.js'

export const extractCliManagedConfig = (
  activeTarget: Record<string, unknown>,
): CliManagedConfig => {
  const result: CliManagedConfig = {}

  if (typeof activeTarget.schemaVersion === 'string') {
    result.schemaVersion = activeTarget.schemaVersion
  }

  if (typeof activeTarget.target === 'string') {
    result.target = activeTarget.target as InstallTargetId
  }

  if (typeof activeTarget.global === 'boolean') {
    result.global = activeTarget.global
  }

  if (activeTarget.packages !== undefined) {
    if (!isPlainObject(activeTarget.packages)) {
      throw new ConfigValidationError('packages must be an object', 'type_mismatch')
    }

    const packages: Record<string, string> = {}
    for (const [key, value] of Object.entries(activeTarget.packages)) {
      if (typeof value !== 'string') {
        throw new ConfigValidationError(`packages.${key} must be a string`, 'type_mismatch')
      }
      packages[key] = value
    }
    result.packages = packages
  }

  const registryUrlAlias = getRegistryUrlAlias(activeTarget)
  if (isPlainObject(activeTarget.registry)) {
    const url = activeTarget.registry.url
    const ref = activeTarget.registry.ref
    if (typeof url === 'string') {
      result.registry = {
        url,
        ref: typeof ref === 'string' ? ref : DEFAULT_REGISTRY_REF,
      }
    } else if (typeof ref === 'string') {
      result.registry = {
        url: DEFAULT_REGISTRY_CONFIG.url,
        ref,
      }
    } else if (registryUrlAlias) {
      result.registry = {
        url: registryUrlAlias,
        ref: getRegistryRefDefault(activeTarget),
      }
    }
  } else if (registryUrlAlias) {
    result.registry = {
      url: registryUrlAlias,
      ref: getRegistryRefDefault(activeTarget),
    }
  }

  return result
}
