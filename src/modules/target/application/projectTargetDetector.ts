import fs from 'node:fs/promises'

import { evaluateTargetMarkers } from '../domain/installTargetMarkers.js'
import type { TargetMarkerProbe } from '../domain/markerProbe.js'
import { isNodeError } from '../domain/nodeErrors.js'
import type { TargetDetectionResult } from '../domain/targetDetection.js'
import { TargetDetectionError } from '../domain/targetDetectionErrors.js'
import { defaultMarkerProbe } from '../infrastructure/markerProbe.js'

const throwProjectRootUnavailable = (projectRoot: string): never => {
  throw new TargetDetectionError(
    `Project root is not available: ${projectRoot}`,
    'project_root_unavailable',
  )
}

const assertProjectRootAvailable = async (projectRoot: string): Promise<void> => {
  try {
    const stats = await fs.stat(projectRoot)

    if (!stats.isDirectory()) {
      throw new TargetDetectionError(
        `Project root is not a directory: ${projectRoot}`,
        'project_root_unavailable',
      )
    }
  } catch (error) {
    if (error instanceof TargetDetectionError) {
      throw error
    }

    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'EACCES')) {
      throwProjectRootUnavailable(projectRoot)
    }

    throw error
  }
}

const buildTargetDetectionResult = (
  matches: TargetDetectionResult['matches'],
): TargetDetectionResult => {
  const detected = matches.map((match) => match.target)

  if (detected.length === 0) {
    return {
      status: 'none',
      detected: [],
      matches: [],
    }
  }

  if (detected.length === 1) {
    return {
      status: 'single',
      detected,
      matches,
      suggestedTarget: detected[0],
    }
  }

  return {
    status: 'ambiguous',
    detected,
    matches,
  }
}

export class ProjectTargetDetector {
  private readonly probe: TargetMarkerProbe

  constructor(probe: TargetMarkerProbe = defaultMarkerProbe) {
    this.probe = probe
  }

  async detect(projectRoot: string): Promise<TargetDetectionResult> {
    await assertProjectRootAvailable(projectRoot)
    const matches = await evaluateTargetMarkers(projectRoot, this.probe)
    return buildTargetDetectionResult(matches)
  }
}
