import semver from 'semver'

import { ConfigValidationError } from '../../config/domain/configErrors.js'
import type { AgentsLockDocument } from '../../config/domain/agentsLock.js'
import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'

export const validateLockVersionRanges = (
  resolved: ResolvedAgentsConfig,
  lock: AgentsLockDocument,
  options: { readonly force?: boolean },
): void => {
  if (options.force === true) {
    return
  }

  const packageIds = Object.keys(resolved.packages).sort((left, right) => left.localeCompare(right))

  for (const packageId of packageIds) {
    const range = resolved.packages[packageId]
    const lockVersion = lock.packages[packageId].version

    if (!semver.satisfies(lockVersion, range, { includePrerelease: false })) {
      throw new ConfigValidationError(
        `Lock version ${lockVersion} for ${packageId} does not satisfy agents.json range ${range}`,
        'lock_version_range_mismatch',
      )
    }
  }
}
