import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { resolveTargetsFromManaged } from '../../config/application/resolveTargets.js'
import type { InstallTargetId } from '../../registry/domain/package.js'

export const resolveInstallTargets = (resolved: ResolvedAgentsConfig): InstallTargetId[] => {
  const targets = resolveTargetsFromManaged({ targets: resolved.targets })
  if (targets === undefined || targets.length === 0) {
    throw new ConfigValidationError('Install target is required but missing from config', 'missing_target')
  }

  return targets
}

export const isGreenfieldInstallBootstrap = (
  resolved: ResolvedAgentsConfig,
  requestedPackageId: string | undefined,
): boolean => {
  if (requestedPackageId === undefined) {
    return false
  }

  if (resolved.gateMode !== 'greenfield') {
    return false
  }

  const targets = resolveTargetsFromManaged({ targets: resolved.targets })
  return targets === undefined || targets.length === 0
}
