import type { RegistryConfig } from '../../registry/infrastructure/registrySourceConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { DEFAULT_REGISTRY_REF } from '../domain/configConstants.js'
import type { CliManagedConfig, SchemaGateMode } from '../domain/agentsConfig.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'
import {
  getRegistryRefDefault,
  getRegistryUrlAlias,
} from './schemaGate.js'

export const extractCliManagedConfig = (
  activeTarget: Record<string, unknown>,
): CliManagedConfig => {
  const result: {
    schemaVersion?: string
    registry?: RegistryConfig
    target?: InstallTargetId
    packages?: Record<string, string>
    global?: boolean
  } = {}

  if (typeof activeTarget.schemaVersion === 'string') {
    result.schemaVersion = activeTarget.schemaVersion
  }

  if (typeof activeTarget.target === 'string') {
    result.target = activeTarget.target as InstallTargetId
  }

  if (typeof activeTarget.global === 'boolean') {
    result.global = activeTarget.global
  }

  if (activeTarget.packages !== undefined && isPlainObject(activeTarget.packages)) {
    const packages: Record<string, string> = {}
    for (const [key, value] of Object.entries(activeTarget.packages)) {
      if (typeof value === 'string') {
        packages[key] = value
      }
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

export const resolveWriteGateMode = (
  existing: Record<string, unknown> | null,
  gateMode: SchemaGateMode,
): SchemaGateMode => {
  if (existing === null) {
    return 'greenfield'
  }
  return gateMode
}
