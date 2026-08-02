import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { collectProjectMetadataSignals } from '../../../src/modules/registry/application/collectProjectMetadataSignals.js'

describe('collectProjectMetadataSignals', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const withTempProject = (files: Record<string, string>): string => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-signals-'))
    tempDirs.push(dir)

    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(dir, relativePath)
      writeFileSync(fullPath, content, 'utf8')
    }

    return dir
  }

  it('collects dependency and name tokens from package.json', () => {
    const cwd = withTempProject({
      'package.json': JSON.stringify({
        name: '@acme/demo-app',
        dependencies: {
          react: '^18.0.0',
        },
        devDependencies: {
          vitest: '^1.0.0',
        },
      }),
    })

    const result = collectProjectMetadataSignals({
      cwd,
      installedPackageIds: ['agents-repo/installed'],
    })

    expect(result.signals.map((entry) => entry.value)).toEqual(
      expect.arrayContaining(['acme', 'demo-app', 'react', 'vitest']),
    )
    expect(result.installedPackageIds.has('agents-repo/installed')).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('tokenizes README and warns on invalid package.json', () => {
    const cwd = withTempProject({
      'package.json': '{ not-json',
      'README.md': '# Accessibility testing toolkit',
    })

    const result = collectProjectMetadataSignals({ cwd })

    expect(result.warnings.some((warning) => warning.includes('package.json'))).toBe(true)
    expect(result.signals.some((entry) => entry.value === 'accessibility')).toBe(true)
    expect(result.signals.some((entry) => entry.source === 'readme')).toBe(true)
  })
})
