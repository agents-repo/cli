import { ConfigValidationError } from '../../config/domain/configErrors.js'
import type { AgentsLockDocument } from '../../config/domain/agentsLock.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { formatMissingByTargetSlotMessage } from '../../config/domain/lockInstallMessages.js'
export const validateCiConfigLockPackageSets = (
  resolved: ResolvedAgentsConfig,
  lock: AgentsLockDocument,
): void => {
  const configIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))
  const lockIds = Object.keys(lock.packages).sort((left, right) => left.localeCompare(right))

  if (configIds.length !== lockIds.length) {
    throw new ConfigValidationError(
      'agents.json packages and agents-lock.json packages must list the same package ids',
      'lock_config_package_drift',
    )
  }

  for (let index = 0; index < configIds.length; index += 1) {
    if (configIds[index] !== lockIds[index]) {
      throw new ConfigValidationError(
        'agents.json packages and agents-lock.json packages must list the same package ids',
        'lock_config_package_drift',
      )
    }
  }
}

export const validateCiRequiredByTargetSlots = (
  lock: AgentsLockDocument,
  packageIds: readonly string[],
  targetIds: readonly InstallTargetId[],
): void => {
  for (const packageId of packageIds) {
    const entry = lock.packages[packageId]
    for (const targetId of targetIds) {
      if (entry.byTarget[targetId] === undefined) {
        throw new ConfigValidationError(
          formatMissingByTargetSlotMessage(packageId, targetId),
          'missing_by_target_slot',
        )
      }
    }
  }
}
