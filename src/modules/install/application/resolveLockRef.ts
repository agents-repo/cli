import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { isConcreteRegistryRef } from '../../config/domain/validators.js'
import type { RegistryCatalogLoadResult } from '../../registry/infrastructure/registryRepository.js'
import { RegistryRefResolutionError } from '../../registry/domain/errors.js'

export const resolveLockRef = (
  config: ResolvedAgentsConfig,
  catalogResult: RegistryCatalogLoadResult,
): string => {
  const fromResolution = catalogResult.baseUrlRefResolution?.resolvedRef
  if (fromResolution !== undefined) {
    return fromResolution
  }

  const configuredRef = config.registry.ref
  if (isConcreteRegistryRef(configuredRef)) {
    return configuredRef
  }

  throw new RegistryRefResolutionError(
    'Could not determine concrete registry ref for agents-lock.json resolvedRef',
  )
}

export const assertResolvableLockRef = (ref: string): void => {
  if (!isConcreteRegistryRef(ref)) {
    throw new ConfigValidationError(
      'Registry ref must resolve to a concrete git ref before lock write',
      'type_mismatch',
    )
  }
}
