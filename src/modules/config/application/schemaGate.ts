import {
  AGENTS_REPO_NAMESPACE,
  DEFAULT_REGISTRY_REF,
  REGISTRY_URL_MIGRATION_KEY,
  SUPPORTED_CONFIG_SCHEMA_VERSIONS,
} from '../domain/configConstants.js'
import type { SchemaGateMode, AgentsConfigDocument } from '../domain/agentsConfig.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'

export class SchemaGate {
  determineMode(raw: AgentsConfigDocument | null): SchemaGateMode {
    if (raw === null || Object.keys(raw).length === 0) {
      return 'greenfield'
    }

    const schemaVersion = raw.schemaVersion
    if (
      typeof schemaVersion === 'string' &&
      (SUPPORTED_CONFIG_SCHEMA_VERSIONS as readonly string[]).includes(schemaVersion)
    ) {
      return 'top-level-ours'
    }

    return 'namespace'
  }
}

export const getActiveGateTarget = (
  raw: AgentsConfigDocument,
  gateMode: SchemaGateMode,
): Record<string, unknown> => {
  if (gateMode === 'namespace') {
    const namespaceBlock = raw[AGENTS_REPO_NAMESPACE]
    if (isPlainObject(namespaceBlock)) {
      return namespaceBlock
    }
    return {}
  }

  return raw
}

export const getNamespaceBlock = (raw: AgentsConfigDocument): Record<string, unknown> | undefined => {
  const namespaceBlock = raw[AGENTS_REPO_NAMESPACE]
  if (isPlainObject(namespaceBlock)) {
    return namespaceBlock
  }
  return undefined
}

export const hasRegistryUrlAlias = (target: Record<string, unknown>): boolean => {
  return typeof target[REGISTRY_URL_MIGRATION_KEY] === 'string'
}

export const getRegistryUrlAlias = (target: Record<string, unknown>): string | undefined => {
  const value = target[REGISTRY_URL_MIGRATION_KEY]
  return typeof value === 'string' ? value : undefined
}

export const getRegistryRefDefault = (target: Record<string, unknown>): string => {
  if (isPlainObject(target.registry) && typeof target.registry.ref === 'string') {
    return target.registry.ref
  }
  return DEFAULT_REGISTRY_REF
}
