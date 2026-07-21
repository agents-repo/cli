import {
  AGENTS_REPO_NAMESPACE,
  CONFIG_SCHEMA_VERSION,
  REGISTRY_URL_MIGRATION_KEY,
} from '../domain/configConstants.js'
import type {
  AgentsConfigDocument,
  CliManagedConfig,
  SchemaGateMode,
} from '../domain/agentsConfig.js'
import { ConfigValidationError } from '../domain/configErrors.js'
import {
  DEFAULT_REGISTRY_CONFIG,
  type RegistryConfig,
} from '../../registry/infrastructure/registrySourceConfig.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'
import { getRegistryRefDefault, getRegistryUrlAlias } from './schemaGate.js'

export class ConfigMerger {
  merge(
    existing: AgentsConfigDocument | null,
    patch: Partial<CliManagedConfig>,
    options: { gateMode: SchemaGateMode; force?: boolean },
  ): AgentsConfigDocument {
    const force = options.force ?? false

    if (existing === null) {
      return this.mergeGreenfield(patch)
    }

    if (options.gateMode === 'greenfield') {
      if (Object.keys(existing).length > 0) {
        throw new ConfigValidationError(
          'Cannot merge with greenfield gate mode when agents.json already contains keys',
          'invalid_merge_state',
        )
      }
      return this.mergeGreenfield(patch)
    }

    if (options.gateMode === 'namespace') {
      return this.mergeNamespace(existing, patch, force)
    }

    return this.mergeTopLevel(existing, patch, force)
  }

  private mergeGreenfield(patch: Partial<CliManagedConfig>): AgentsConfigDocument {
    const document: AgentsConfigDocument = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      registry: patch.registry ?? DEFAULT_REGISTRY_CONFIG,
      packages: patch.packages ?? {},
    }

    if (patch.target !== undefined) {
      document.target = patch.target
    }
    if (patch.global !== undefined) {
      document.global = patch.global
    }

    return this.canonicalizeRegistryUrl(document)
  }

  private mergeTopLevel(
    existing: AgentsConfigDocument,
    patch: Partial<CliManagedConfig>,
    force: boolean,
  ): AgentsConfigDocument {
    const document: AgentsConfigDocument = { ...existing }

    if (patch.schemaVersion !== undefined) {
      document.schemaVersion = patch.schemaVersion
    } else if (!('schemaVersion' in document)) {
      document.schemaVersion = CONFIG_SCHEMA_VERSION
    }

    if (patch.registry !== undefined) {
      document.registry = this.mergeRegistry(document.registry, patch.registry, force)
    }

    if (patch.target !== undefined) {
      document.target = this.mergeScalar(document.target, patch.target, force)
    }

    if (patch.global !== undefined) {
      document.global = this.mergeScalar(document.global, patch.global, force)
    }

    if (patch.packages !== undefined) {
      document.packages = this.mergePackages(document.packages, patch.packages, force)
    }

    return this.finalizeManagedWriteFields(this.canonicalizeRegistryUrl(document))
  }

  private mergeNamespace(
    existing: AgentsConfigDocument,
    patch: Partial<CliManagedConfig>,
    force: boolean,
  ): AgentsConfigDocument {
    const document: AgentsConfigDocument = { ...existing }
    const namespaceBlock = document[AGENTS_REPO_NAMESPACE]
    const currentNamespace = isPlainObject(namespaceBlock) ? { ...namespaceBlock } : {}

    const mergedNamespace = this.mergeManagedIntoTarget(currentNamespace, patch, force)
    const migratedNamespace = this.canonicalizeRegistryUrl(mergedNamespace)
    document[AGENTS_REPO_NAMESPACE] = this.finalizeManagedWriteFields(migratedNamespace)

    return document
  }

  private mergeManagedIntoTarget(
    target: Record<string, unknown>,
    patch: Partial<CliManagedConfig>,
    force: boolean,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target }

    if (patch.schemaVersion !== undefined) {
      result.schemaVersion = patch.schemaVersion
    }

    if (patch.registry !== undefined) {
      result.registry = this.mergeRegistry(result.registry, patch.registry, force)
    }

    if (patch.target !== undefined) {
      result.target = this.mergeScalar(result.target, patch.target, force)
    }

    if (patch.global !== undefined) {
      result.global = this.mergeScalar(result.global, patch.global, force)
    }

    if (patch.packages !== undefined) {
      result.packages = this.mergePackages(result.packages, patch.packages, force)
    }

    return result
  }

  private finalizeManagedWriteFields(target: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target }
    result.registry = this.mergeRegistry(result.registry, DEFAULT_REGISTRY_CONFIG, false)

    if (!('packages' in result) || !isPlainObject(result.packages)) {
      result.packages = {}
    }

    return result
  }

  private mergeRegistry(
    existing: unknown,
    patch: RegistryConfig,
    force: boolean,
  ): RegistryConfig {
    const current = this.readRegistry(existing)

    if (force) {
      return {
        url: patch.url ?? current.url ?? DEFAULT_REGISTRY_CONFIG.url,
        ref: patch.ref ?? current.ref ?? DEFAULT_REGISTRY_CONFIG.ref,
      }
    }

    return {
      url: current.url ?? patch.url ?? DEFAULT_REGISTRY_CONFIG.url,
      ref: current.ref ?? patch.ref ?? DEFAULT_REGISTRY_CONFIG.ref,
    }
  }

  private readRegistry(existing: unknown): Partial<RegistryConfig> {
    if (!isPlainObject(existing)) {
      return {}
    }

    return {
      url: typeof existing.url === 'string' ? existing.url : undefined,
      ref: typeof existing.ref === 'string' ? existing.ref : undefined,
    }
  }

  private mergePackages(
    existing: unknown,
    patch: Record<string, string>,
    force: boolean,
  ): Record<string, string> {
    const current = isPlainObject(existing)
      ? Object.fromEntries(
          Object.entries(existing).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
      : {}

    if (force) {
      return { ...current, ...patch }
    }

    const result = { ...current }
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in result)) {
        result[key] = value
      }
    }
    return result
  }

  private mergeScalar<T>(existing: unknown, patch: T, force: boolean): T {
    if (force || existing === undefined) {
      return patch
    }
    return existing as T
  }

  private canonicalizeRegistryUrl<T extends Record<string, unknown>>(target: T): T {
    const alias = getRegistryUrlAlias(target)
    if (!alias) {
      return target
    }

    const mutable: Record<string, unknown> = { ...target }
    const currentRegistry = mutable.registry
    const hasUrl = isPlainObject(currentRegistry) && typeof currentRegistry.url === 'string'

    if (!hasUrl) {
      mutable.registry = {
        ...(isPlainObject(currentRegistry) ? currentRegistry : {}),
        url: alias,
        ref: getRegistryRefDefault(mutable),
      }
    }

    delete mutable[REGISTRY_URL_MIGRATION_KEY]
    return mutable as T
  }
}
