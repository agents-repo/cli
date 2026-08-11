import { DEFAULT_REGISTRY_CONFIG, type RegistryConfig } from '../../registry/infrastructure/registrySourceConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { DEFAULT_REGISTRY_REF } from '../domain/configConstants.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import type { CliManagedConfig } from '../domain/agentsConfig.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'
import { getRegistryRefDefault, getRegistryUrlAlias } from './schemaGate.js'
import { parseInstallTargetsArray } from './resolveTargets.js'

const parseManagedPackages = (
  packagesValue: unknown,
): Record<string, string> | undefined => {
  if (packagesValue === undefined) {
    return undefined
  }

  if (!isPlainObject(packagesValue)) {
    throw new ConfigValidationError('packages must be an object', 'type_mismatch')
  }

  const packages: Record<string, string> = {}
  for (const [key, value] of Object.entries(packagesValue)) {
    if (typeof value !== 'string') {
      throw new ConfigValidationError(`packages.${key} must be a string`, 'type_mismatch')
    }
    packages[key] = value
  }
  return packages
}

const resolveRegistryFromObject = (
  registry: Record<string, unknown>,
  registryUrlAlias: string | undefined,
  activeTarget: Record<string, unknown>,
): RegistryConfig | undefined => {
  const url = registry.url
  const ref = registry.ref

  if (typeof url === 'string') {
    return {
      url,
      ref: typeof ref === 'string' ? ref : DEFAULT_REGISTRY_REF,
    }
  }

  if (registryUrlAlias) {
    return {
      url: registryUrlAlias,
      ref: typeof ref === 'string' ? ref : getRegistryRefDefault(activeTarget),
    }
  }

  if (typeof ref === 'string') {
    return {
      url: DEFAULT_REGISTRY_CONFIG.url,
      ref,
    }
  }

  return undefined
}

const resolveManagedRegistryFromActiveTarget = (
  activeTarget: Record<string, unknown>,
): RegistryConfig | undefined => {
  const registryUrlAlias = getRegistryUrlAlias(activeTarget)
  if (isPlainObject(activeTarget.registry)) {
    return resolveRegistryFromObject(activeTarget.registry, registryUrlAlias, activeTarget)
  }

  if (registryUrlAlias) {
    return {
      url: registryUrlAlias,
      ref: getRegistryRefDefault(activeTarget),
    }
  }

  return undefined
}

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

  const packages = parseManagedPackages(activeTarget.packages)
  if (packages !== undefined) {
    managed.packages = packages
  }

  const registry = resolveManagedRegistryFromActiveTarget(activeTarget)
  if (registry !== undefined) {
    managed.registry = registry
  }

  return managed
}
