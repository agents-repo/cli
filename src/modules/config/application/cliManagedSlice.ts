import { DEFAULT_REGISTRY_CONFIG, type RegistryConfig } from '../../registry/infrastructure/registrySourceConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { DEFAULT_REGISTRY_REF } from '../domain/configConstants.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import type { CliManagedConfig } from '../domain/agentsConfig.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'
import { getRegistryRefDefault, getRegistryUrlAlias } from './schemaGate.js'
import { parseInstallTargetsArray } from './resolveTargets.js'

export const extractCliManagedConfig = (
  activeTarget: Record<string, unknown>,
): CliManagedConfig => {
  if ('target' in activeTarget) {
    throw new ConfigValidationError(
      'agents.json managed field "target" is deprecated; use "targets" array instead',
      'deprecated_field',
    )
  }

  if ('global' in activeTarget) {
    throw new ConfigValidationError(
      'agents.json managed field "global" is removed; use install -g for global scope',
      'deprecated_field',
    )
  }

  const managed: {
    schemaVersion?: string
    registry?: RegistryConfig
    targets?: InstallTargetId[]
    packages?: Record<string, string>
  } = {}

  if (typeof activeTarget.schemaVersion === 'string') {
    managed.schemaVersion = activeTarget.schemaVersion
  }

  if (activeTarget.targets !== undefined) {
    managed.targets = parseInstallTargetsArray(activeTarget.targets, 'targets')
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
    managed.packages = packages
  }

  const registryUrlAlias = getRegistryUrlAlias(activeTarget)
  if (isPlainObject(activeTarget.registry)) {
    const url = activeTarget.registry.url
    const ref = activeTarget.registry.ref
    if (typeof url === 'string') {
      managed.registry = {
        url,
        ref: typeof ref === 'string' ? ref : DEFAULT_REGISTRY_REF,
      }
    } else if (registryUrlAlias) {
      managed.registry = {
        url: registryUrlAlias,
        ref: typeof ref === 'string' ? ref : getRegistryRefDefault(activeTarget),
      }
    } else if (typeof ref === 'string') {
      managed.registry = {
        url: DEFAULT_REGISTRY_CONFIG.url,
        ref,
      }
    }
  } else if (registryUrlAlias) {
    managed.registry = {
      url: registryUrlAlias,
      ref: getRegistryRefDefault(activeTarget),
    }
  }

  return managed
}
