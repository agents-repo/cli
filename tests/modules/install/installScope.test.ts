import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveInstallScope } from '../../../src/modules/install/application/installScope.js'

describe('resolveInstallScope', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses the project cwd by default', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-scope-project-'))
    tempDirs.push(cwd)

    const scope = resolveInstallScope({ cwd, globalFlag: false, configGlobal: false })

    expect(scope.global).toBe(false)
    expect(scope.extractRoot).toBe(cwd)
    expect(scope.mutateProjectConfig).toBe(true)
  })

  it('forces global scope when -g is set', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-scope-global-flag-'))
    tempDirs.push(cwd)

    const scope = resolveInstallScope({ cwd, globalFlag: true, configGlobal: false })

    expect(scope.global).toBe(true)
    expect(scope.extractRoot).toContain('.config/agents-repo')
    expect(scope.mutateProjectConfig).toBe(false)
  })

  it('uses global scope from config when globalFlag is unset', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-scope-config-global-'))
    tempDirs.push(cwd)

    const scope = resolveInstallScope({ cwd, configGlobal: true })

    expect(scope.global).toBe(true)
    expect(scope.mutateProjectConfig).toBe(false)
  })

  it('respects HOME from env when resolving global extract root', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-scope-home-env-'))
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-install-scope-home-dir-'))
    tempDirs.push(cwd)
    tempDirs.push(homeDir)

    const scope = resolveInstallScope({
      cwd,
      env: { HOME: homeDir },
      globalFlag: true,
    })

    expect(scope.extractRoot).toBe(path.join(homeDir, '.config', 'agents-repo'))
  })
})
