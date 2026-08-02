import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js'
import { createCliProgram } from '../../../src/modules/cli/presentation/createCliProgram.js'

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
}))

vi.mock('../../../src/modules/registry/application/suggestAgentsService.js', () => ({
  SuggestAgentsService: class {
    run = runMock
  },
}))

describe('suggest-agents command', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetCliGlobals()
    runMock.mockReset()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints text suggestions', async () => {
    runMock.mockResolvedValue({
      suggestions: [
        {
          pkg: {
            id: 'agents-repo/sample-agent',
            name: 'sample-agent',
            description: 'Sample',
            latest: '1.0.0',
            status: 'active',
            owner: 'agents-repo',
          },
          score: 5,
          matchedSignals: ['sample'],
        },
      ],
      signals: [],
      indexUrl: 'https://example.test/index.json',
      updatedAt: '2026-01-01T00:00:00.000Z',
      warnings: [],
    })

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const program = createCliProgram()
    await program.parseAsync(['suggest-agents'], { from: 'user' })

    expect(runMock).toHaveBeenCalledWith({ yes: false, limit: 10 })
    expect(stdoutSpy.mock.calls.map((call) => String(call[0])).join('')).toContain(
      'agents-repo/sample-agent@1.0.0',
    )
  })

  it('emits JSON suggestions when --json is set', async () => {
    runMock.mockResolvedValue({
      suggestions: [],
      signals: [],
      indexUrl: 'https://example.test/index.json',
      updatedAt: '2026-01-01T00:00:00.000Z',
      warnings: [],
    })

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const program = createCliProgram()
    await program.parseAsync(['--json', 'suggest', '--limit', '3'], { from: 'user' })

    expect(runMock).toHaveBeenCalledWith({ yes: false, limit: 3 })
    const payload = JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0])) as {
      suggestions: unknown[]
    }
    expect(payload.suggestions).toEqual([])
  })

  it('exits 2 for invalid --limit', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const program = createCliProgram()
    await program.parseAsync(['suggest-agents', '--limit', '0'], { from: 'user' })

    expect(exitSpy).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((call) => String(call[0])).join('')).toContain('Invalid --limit')
  })

  it('exits 2 for non-integer --limit suffix', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const program = createCliProgram()
    await program.parseAsync(['suggest-agents', '--limit', '3abc'], { from: 'user' })

    expect(exitSpy).toHaveBeenCalledWith(2)
    expect(stderrSpy.mock.calls.map((call) => String(call[0])).join('')).toContain('Invalid --limit')
  })
})
