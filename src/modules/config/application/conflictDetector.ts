import {
  AGENTS_REPO_NAMESPACE,
  CLI_MANAGED_KEYS,
  REGISTRY_URL_MIGRATION_KEY,
} from '../domain/configConstants.js'
import type { SchemaGateMode, AgentsConfigDocument } from '../domain/agentsConfig.js'
import type { ConfigConflictRecord } from '../domain/configErrors.js'
import { ConfigConflictError, ConfigValidationError } from '../domain/configErrors.js'
import {
  isQualifiedPackageId,
  isValidInstallTargetId,
  isValidSemverRange,
} from '../domain/validators.js'
import { isPlainObject, valuesAreEqual } from '../infrastructure/jsonDocument.js'
import { getActiveGateTarget, getNamespaceBlock } from './schemaGate.js'

export interface ConflictDetectionResult {
  readonly errors: readonly ConfigConflictRecord[]
  readonly warnings: readonly ConfigConflictRecord[]
}

export class ConflictDetector {
  detect(
    raw: AgentsConfigDocument,
    gateMode: SchemaGateMode,
    options: { waiveConflicts?: boolean } = {},
  ): ConflictDetectionResult {
    const errors: ConfigConflictRecord[] = []
    const warnings: ConfigConflictRecord[] = []

    if (gateMode === 'greenfield') {
      return { errors, warnings }
    }

    const activeTarget = getActiveGateTarget(raw, gateMode)
    errors.push(...this.validateActiveTarget(activeTarget, gateMode))

    if (gateMode === 'top-level-ours') {
      const dualConflicts = this.detectDualDefinitionMismatches(raw)
      for (const conflict of dualConflicts) {
        if (options.waiveConflicts) {
          warnings.push({ ...conflict, severity: 'warning' })
        } else {
          errors.push({ ...conflict, severity: 'error' })
        }
      }
    }

    return { errors, warnings }
  }

  detectOrThrow(
    raw: AgentsConfigDocument,
    gateMode: SchemaGateMode,
    options: { waiveConflicts?: boolean } = {},
  ): readonly ConfigConflictRecord[] {
    const result = this.detect(raw, gateMode, options)
    const blockingErrors = result.errors.filter((entry) => entry.severity === 'error')

    if (blockingErrors.length > 0) {
      const dualErrors = blockingErrors.filter((entry) => entry.code === 'dual_definition_mismatch')
      if (dualErrors.length > 0) {
        throw new ConfigConflictError(
          'Config contains dual definition mismatches between top-level and @agents-repo',
          dualErrors,
        )
      }

      const first = blockingErrors[0]
      throwConflictAsValidationError(first)
    }

    return result.warnings
  }

  private validateActiveTarget(
    activeTarget: Record<string, unknown>,
    gateMode: SchemaGateMode,
  ): ConfigConflictRecord[] {
    const errors: ConfigConflictRecord[] = []
    const prefix = gateMode === 'namespace' ? `${AGENTS_REPO_NAMESPACE}.` : ''

    for (const key of CLI_MANAGED_KEYS) {
      if (!(key in activeTarget)) {
        continue
      }

      const value = activeTarget[key]
      const path = `${prefix}${key}`

      switch (key) {
        case 'schemaVersion':
          if (typeof value !== 'string') {
            errors.push(typeMismatch(path, 'schemaVersion must be a string'))
          }
          break
        case 'target':
          if (typeof value !== 'string') {
            errors.push(typeMismatch(path, 'target must be a string'))
          } else if (!isValidInstallTargetId(value)) {
            errors.push(invalidEnum(path, `target "${value}" is not a supported install target id`))
          }
          break
        case 'global':
          if (typeof value !== 'boolean') {
            errors.push(typeMismatch(path, 'global must be a boolean'))
          }
          break
        case 'registry':
          errors.push(...this.validateRegistry(value, path))
          break
        case 'packages':
          errors.push(...this.validatePackages(value, path))
          break
        default:
          break
      }
    }

    if (REGISTRY_URL_MIGRATION_KEY in activeTarget) {
      const registryUrl = activeTarget[REGISTRY_URL_MIGRATION_KEY]
      if (typeof registryUrl !== 'string') {
        errors.push(typeMismatch(`${prefix}${REGISTRY_URL_MIGRATION_KEY}`, 'registryUrl must be a string'))
      }
    }

    return errors
  }

  private validateRegistry(value: unknown, path: string): ConfigConflictRecord[] {
    if (!isPlainObject(value)) {
      return [typeMismatch(path, 'registry must be an object')]
    }

    const errors: ConfigConflictRecord[] = []
    if ('url' in value && typeof value.url !== 'string') {
      errors.push(typeMismatch(`${path}.url`, 'registry.url must be a string'))
    }
    if ('ref' in value && typeof value.ref !== 'string') {
      errors.push(typeMismatch(`${path}.ref`, 'registry.ref must be a string'))
    }
    return errors
  }

  private validatePackages(value: unknown, path: string): ConfigConflictRecord[] {
    if (!isPlainObject(value)) {
      return [typeMismatch(path, 'packages must be an object')]
    }

    const errors: ConfigConflictRecord[] = []
    for (const [packageId, range] of Object.entries(value)) {
      const entryPath = `${path}.${packageId}`
      if (typeof range !== 'string') {
        errors.push(typeMismatch(entryPath, 'package range must be a string'))
        continue
      }
      if (!isQualifiedPackageId(packageId)) {
        errors.push(invalidEnum(entryPath, `package id "${packageId}" is not a qualified id`))
      }
      if (!isValidSemverRange(range)) {
        errors.push(invalidSemverRange(entryPath, `invalid semver range "${range}"`))
      }
    }
    return errors
  }

  private detectDualDefinitionMismatches(raw: AgentsConfigDocument): ConfigConflictRecord[] {
    const namespaceBlock = getNamespaceBlock(raw)
    if (!namespaceBlock) {
      return []
    }

    const conflicts: ConfigConflictRecord[] = []
    for (const key of CLI_MANAGED_KEYS) {
      if (!(key in raw) || !(key in namespaceBlock)) {
        continue
      }

      const topLevelValue = raw[key]
      const namespaceValue = namespaceBlock[key]
      if (!valuesAreEqual(topLevelValue, namespaceValue)) {
        conflicts.push({
          code: 'dual_definition_mismatch',
          path: key,
          message: `incompatible values for "${key}" at top level and ${AGENTS_REPO_NAMESPACE}`,
          severity: 'error',
        })
      }
    }

    return conflicts
  }
}

const typeMismatch = (path: string, message: string): ConfigConflictRecord => ({
  code: 'type_mismatch',
  path,
  message,
  severity: 'error',
})

const invalidEnum = (path: string, message: string): ConfigConflictRecord => ({
  code: 'invalid_enum',
  path,
  message,
  severity: 'error',
})

const invalidSemverRange = (path: string, message: string): ConfigConflictRecord => ({
  code: 'invalid_semver_range',
  path,
  message,
  severity: 'error',
})

const throwConflictAsValidationError = (conflict: ConfigConflictRecord): never => {
  if (
    conflict.code === 'type_mismatch' ||
    conflict.code === 'invalid_enum' ||
    conflict.code === 'invalid_semver_range'
  ) {
    throw new ConfigValidationError(conflict.message, conflict.code)
  }

  throw new ConfigValidationError(conflict.message, 'type_mismatch')
}
