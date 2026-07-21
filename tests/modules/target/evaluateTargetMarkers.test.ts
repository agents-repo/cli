import { describe, expect, it } from 'vitest'

import {
  evaluateTargetMarkers,
  getInstallTargetMarkerCoverage,
  INSTALL_TARGET_MARKERS,
} from '../../../src/modules/target/domain/installTargetMarkers.js'
import type { TargetMarkerProbe } from '../../../src/modules/target/domain/markerProbe.js'
import { INSTALL_TARGET_IDS } from '../../../src/modules/registry/domain/package.js'

const createProbe = (entries: Record<string, 'file' | 'directory'>): TargetMarkerProbe => ({
  isDirectory: (absolutePath: string) =>
    Promise.resolve(entries[absolutePath] === 'directory'),
  isFile: (absolutePath: string) => Promise.resolve(entries[absolutePath] === 'file'),
})

describe('installTargetMarkers', () => {
  it('covers every install target id', () => {
    expect(getInstallTargetMarkerCoverage()).toEqual([...INSTALL_TARGET_IDS])
    expect(new Set(INSTALL_TARGET_MARKERS.map((marker) => marker.target))).toEqual(
      new Set(INSTALL_TARGET_IDS),
    )
  })

  it('matches any marker within a target and records all triggering paths', async () => {
    const projectRoot = '/project'
    const probe = createProbe({
      '/project/.cursor': 'directory',
      '/project/.cursor/skills': 'directory',
    })

    const matches = await evaluateTargetMarkers(projectRoot, probe)

    expect(matches).toEqual([
      {
        target: 'cursor',
        markers: ['.cursor', '.cursor/skills'],
      },
    ])
  })

  it('returns matches in canonical install target order', async () => {
    const projectRoot = '/project'
    const probe = createProbe({
      '/project/.agents': 'directory',
      '/project/.github/agents': 'directory',
    })

    const matches = await evaluateTargetMarkers(projectRoot, probe)

    expect(matches.map((match) => match.target)).toEqual(['github-copilot', 'openai-codex'])
  })

  it('does not match github-copilot when only workflows exist', async () => {
    const projectRoot = '/project'
    const probe = createProbe({
      '/project/.github/workflows': 'directory',
    })

    const matches = await evaluateTargetMarkers(projectRoot, probe)
    expect(matches).toEqual([])
  })

  it('matches copilot instructions file without agents directory', async () => {
    const projectRoot = '/project'
    const probe = createProbe({
      '/project/.github/copilot-instructions.md': 'file',
    })

    const matches = await evaluateTargetMarkers(projectRoot, probe)
    expect(matches).toEqual([
      {
        target: 'github-copilot',
        markers: ['.github/copilot-instructions.md'],
      },
    ])
  })
})
