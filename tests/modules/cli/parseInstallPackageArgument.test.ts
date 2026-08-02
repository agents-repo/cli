import { describe, expect, it } from 'vitest'

import { parseInstallPackageArgument } from '../../../src/modules/cli/application/parseInstallPackageArgument.js'

describe('parseInstallPackageArgument', () => {
  it('returns package ref without selection when no colon is present', () => {
    expect(parseInstallPackageArgument('agents-repo/sample-agent')).toEqual({
      packageRef: 'agents-repo/sample-agent',
      selection: null,
    })
  })

  it('parses package-id:selector syntax', () => {
    expect(parseInstallPackageArgument('agents-repo/sample-agent:planner')).toEqual({
      packageRef: 'agents-repo/sample-agent',
      selection: { kind: 'single', id: 'planner' },
    })
  })

  it('splits on the first colon only', () => {
    expect(parseInstallPackageArgument('alias:part:extra')).toEqual({
      packageRef: 'alias',
      selection: { kind: 'single', id: 'part:extra' },
    })
  })

  it('throws InvalidUsageError when selector is empty', () => {
    expect(() => parseInstallPackageArgument('agents-repo/sample-agent:')).toThrow(
      /selector must not be empty/,
    )
    try {
      parseInstallPackageArgument('agents-repo/sample-agent:')
    } catch (error) {
      expect(error).toMatchObject({ name: 'InvalidUsageError' })
    }
  })

  it('throws InvalidUsageError when package ref is empty', () => {
    expect(() => parseInstallPackageArgument(':planner')).toThrow(/package-id must appear before/)
  })
})
