import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { parseInstallTargetsArray } from '../../config/application/resolveTargets.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import type { TargetDetectionResult } from '../domain/targetDetection.js'
import { ProjectTargetDetector } from './projectTargetDetector.js'

export interface GreenfieldInstallTargetDetection {
  readonly targets: InstallTargetId[]
  readonly warnings: readonly string[]
}

export const formatAmbiguousTargetDetectionWarning = (
  targets: readonly InstallTargetId[],
): string => {
  return `Multiple install targets detected; using all detected targets: ${targets.join(', ')}`
}

const targetsFromDetection = (detection: TargetDetectionResult): GreenfieldInstallTargetDetection => {
  if (detection.status === 'single' && detection.suggestedTarget !== undefined) {
    return { targets: [detection.suggestedTarget], warnings: [] }
  }

  if (detection.status === 'ambiguous') {
    const targets = parseInstallTargetsArray(detection.detected, 'detected targets')
    return {
      targets,
      warnings: [formatAmbiguousTargetDetectionWarning(targets)],
    }
  }

  throw new ConfigValidationError(
    'Install target could not be detected; pass --targets <id...> to set one or more via init.',
    'missing_target',
  )
}

export const detectGreenfieldInstallTargets = async (
  cwd: string,
  detector: ProjectTargetDetector = new ProjectTargetDetector(),
): Promise<GreenfieldInstallTargetDetection> => {
  const detection = await detector.detect(cwd)
  return targetsFromDetection(detection)
}
