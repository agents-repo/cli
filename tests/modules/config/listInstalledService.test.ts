import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ListInstalledService } from '../../../src/modules/config/application/listInstalledService.js'
import { stringifyJsonDocument } from '../../../src/modules/config/infrastructure/jsonDocument.js'

const cursorSlot = {
  integrity: `sha256-${'a'.repeat(64)}`,
  artifact: '1.0.0-cursor.zip',
}

describe('ListInstalledService incomplete byTarget warnings', () => {
  it('orders warnings by package id then configured target id', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-list-svc-order-'))

    await writeFile(
      path.join(cwd, 'agents.json'),
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor', 'github-copilot'],
        packages: {},
      }),
    )
    await writeFile(
      path.join(cwd, 'agents-lock.json'),
      stringifyJsonDocument({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/zzz-agent': {
            version: '1.0.0',
            byTarget: { cursor: cursorSlot },
          },
          'agents-repo/aaa-agent': {
            version: '1.0.0',
            byTarget: { cursor: cursorSlot },
          },
        },
      }),
    )

    const service = new ListInstalledService()
    const result = await service.run({ cwd, env: {} })

    expect(result.warnings).toEqual([
      'agents-repo/aaa-agent: missing byTarget slot for configured target github-copilot',
      'agents-repo/zzz-agent: missing byTarget slot for configured target github-copilot',
    ])
  })

  it('places config conflict warnings before incomplete byTarget warnings', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agents-list-svc-conflict-'))

    await writeFile(
      path.join(cwd, 'agents.json'),
      stringifyJsonDocument({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor', 'github-copilot'],
        packages: {},
        '@agents-repo': {
          targets: ['claude-code'],
        },
      }),
    )
    await writeFile(
      path.join(cwd, 'agents-lock.json'),
      stringifyJsonDocument({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/sample-agent': {
            version: '1.0.0',
            byTarget: { cursor: cursorSlot },
          },
        },
      }),
    )

    const service = new ListInstalledService()
    const result = await service.run({ cwd, env: {}, yes: true })

    expect(result.warnings.length).toBeGreaterThan(1)
    expect(result.warnings[0]).toMatch(/incompatible values for "targets"/i)
    expect(result.warnings.at(-1)).toBe(
      'agents-repo/sample-agent: missing byTarget slot for configured target github-copilot',
    )
  })
})
