import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { resolveTargetsFromManaged } from '../../config/application/resolveTargets.js'
import { isValidInstallTargetId } from '../../config/domain/validators.js'
import type { InstallTargetId } from '../../registry/domain/package.js'

export const resolveInstallTargets = (
  resolved: ResolvedAgentsConfig,
  targetOverride?: string,
): InstallTargetId[] => {
  if (targetOverride !== undefined) {
    if (!isValidInstallTargetId(targetOverride)) {
      throw new ConfigValidationError(
        `Invalid install target id: ${targetOverride}`,
        'invalid_enum',
      )
    }
    return [targetOverride]
  }

  const managed = {
    target: resolved.target,
    targets: resolved.targets,
  }
  const targets = resolveTargetsFromManaged(managed)
  if (targets === undefined || targets.length === 0) {
    throw new ConfigValidationError('Install target is required but missing from config', 'missing_target')
  }

  return targets
}
