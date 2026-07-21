import path from 'node:path'

import {
  INSTALL_TARGET_IDS,
  type InstallTargetId,
} from '../../registry/domain/package.js'

import type { TargetMarkerProbe } from './markerProbe.js'
import type { TargetDetectionMatch } from './targetDetection.js'

export type MarkerKind = 'file' | 'directory'

export interface InstallTargetMarker {
  readonly target: InstallTargetId
  readonly relativePath: string
  readonly kind: MarkerKind
}

export const INSTALL_TARGET_MARKERS: readonly InstallTargetMarker[] = [
  { target: 'github-copilot', relativePath: '.github/agents', kind: 'directory' },
  { target: 'github-copilot', relativePath: '.github/copilot-instructions.md', kind: 'file' },
  { target: 'cursor', relativePath: '.cursor', kind: 'directory' },
  { target: 'cursor', relativePath: '.cursor/skills', kind: 'directory' },
  { target: 'cursor', relativePath: '.cursor/rules', kind: 'directory' },
  { target: 'claude-code', relativePath: '.claude', kind: 'directory' },
  { target: 'claude-code', relativePath: '.claude/agents', kind: 'directory' },
  { target: 'openai-codex', relativePath: '.agents', kind: 'directory' },
  { target: 'openai-codex', relativePath: '.agents/skills', kind: 'directory' },
] as const

const markerMatchesTarget = async (
  projectRoot: string,
  marker: InstallTargetMarker,
  probe: TargetMarkerProbe,
): Promise<boolean> => {
  const absolutePath = path.join(projectRoot, marker.relativePath)

  if (marker.kind === 'directory') {
    return probe.isDirectory(absolutePath)
  }

  return probe.isFile(absolutePath)
}

export const evaluateTargetMarkers = async (
  projectRoot: string,
  probe: TargetMarkerProbe,
): Promise<readonly TargetDetectionMatch[]> => {
  const markersByTarget = new Map<InstallTargetId, Set<string>>()

  for (const marker of INSTALL_TARGET_MARKERS) {
    if (!(await markerMatchesTarget(projectRoot, marker, probe))) {
      continue
    }

    const existing = markersByTarget.get(marker.target) ?? new Set<string>()
    existing.add(marker.relativePath)
    markersByTarget.set(marker.target, existing)
  }

  return INSTALL_TARGET_IDS.flatMap((target): TargetDetectionMatch[] => {
    const markers = markersByTarget.get(target)
    if (!markers || markers.size === 0) {
      return []
    }

    return [
      {
        target,
        markers: [...markers].sort((left, right) => left.localeCompare(right)),
      },
    ]
  })
}

export const getInstallTargetMarkerCoverage = (): readonly InstallTargetId[] => {
  return INSTALL_TARGET_IDS.filter((targetId) =>
    INSTALL_TARGET_MARKERS.some((marker) => marker.target === targetId),
  )
}
