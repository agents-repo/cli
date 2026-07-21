import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ProjectTargetDetector } from '../../../src/modules/target/application/projectTargetDetector.js'
import type { TargetMarkerProbe } from '../../../src/modules/target/domain/markerProbe.js'
import { TargetDetectionError } from '../../../src/modules/target/domain/targetDetectionErrors.js'
import { defaultMarkerProbe } from '../../../src/modules/target/infrastructure/markerProbe.js'

const detector = new ProjectTargetDetector()

const createProjectRoot = async (): Promise<string> => mkdtemp(path.join(os.tmpdir(), 'agents-target-'))

const ensureDir = async (root: string, relativePath: string): Promise<void> => {
  await mkdir(path.join(root, relativePath), { recursive: true })
}

const ensureFile = async (root: string, relativePath: string): Promise<void> => {
  const absolutePath = path.join(root, relativePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, '# marker\n', 'utf8')
}

describe('ProjectTargetDetector', () => {
  it('returns none for an empty project', async () => {
    const root = await createProjectRoot()
    const result = await detector.detect(root)

    expect(result).toEqual({
      status: 'none',
      detected: [],
      matches: [],
    })
  })

  it('suggests cursor for a bare .cursor directory', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.cursor')

    const result = await detector.detect(root)

    expect(result.status).toBe('single')
    expect(result.suggestedTarget).toBe('cursor')
    expect(result.matches).toEqual([
      {
        target: 'cursor',
        markers: ['.cursor'],
      },
    ])
  })

  it('suggests cursor for .cursor/rules only', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.cursor/rules')

    const result = await detector.detect(root)

    expect(result.status).toBe('single')
    expect(result.suggestedTarget).toBe('cursor')
    expect(result.matches[0]?.markers).toContain('.cursor')
    expect(result.matches[0]?.markers).toContain('.cursor/rules')
  })

  it.each([
    { relativePath: '.cursor/skills', expectedTarget: 'cursor' },
    { relativePath: '.claude', expectedTarget: 'claude-code' },
    { relativePath: '.agents', expectedTarget: 'openai-codex' },
  ] as const)(
    'suggests $expectedTarget when $relativePath exists',
    async ({ relativePath, expectedTarget }) => {
      const root = await createProjectRoot()
      await ensureDir(root, relativePath)

      const result = await detector.detect(root)
      expect(result.suggestedTarget).toBe(expectedTarget)
    },
  )

  it('suggests claude-code for .claude/agents layout and records subpath markers', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.claude/agents')

    const result = await detector.detect(root)

    expect(result.suggestedTarget).toBe('claude-code')
    expect(result.matches).toEqual([
      {
        target: 'claude-code',
        markers: ['.claude', '.claude/agents'],
      },
    ])
  })

  it('suggests openai-codex for .agents/skills layout and records subpath markers', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.agents/skills')

    const result = await detector.detect(root)

    expect(result.suggestedTarget).toBe('openai-codex')
    expect(result.matches).toEqual([
      {
        target: 'openai-codex',
        markers: ['.agents', '.agents/skills'],
      },
    ])
  })

  it('does not suggest github-copilot for workflows-only .github', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.github/workflows')

    const result = await detector.detect(root)
    expect(result.status).toBe('none')
  })

  it('suggests github-copilot for .github/agents', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.github/agents')

    const result = await detector.detect(root)
    expect(result.suggestedTarget).toBe('github-copilot')
  })

  it('suggests github-copilot for copilot-instructions.md only', async () => {
    const root = await createProjectRoot()
    await ensureFile(root, '.github/copilot-instructions.md')

    const result = await detector.detect(root)
    expect(result.suggestedTarget).toBe('github-copilot')
    expect(result.matches).toEqual([
      {
        target: 'github-copilot',
        markers: ['.github/copilot-instructions.md'],
      },
    ])
  })

  it('records all github-copilot markers when multiple paths match', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.github/agents')
    await ensureFile(root, '.github/copilot-instructions.md')

    const result = await detector.detect(root)

    expect(result.suggestedTarget).toBe('github-copilot')
    expect(result.matches).toEqual([
      {
        target: 'github-copilot',
        markers: ['.github/agents', '.github/copilot-instructions.md'],
      },
    ])
  })

  it('returns ambiguous when cursor and claude markers coexist', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.cursor')
    await ensureDir(root, '.claude')

    const result = await detector.detect(root)

    expect(result.status).toBe('ambiguous')
    expect(result.suggestedTarget).toBeUndefined()
    expect(result.detected).toEqual(['claude-code', 'cursor'])
    expect(result.matches).toHaveLength(2)
  })

  it('returns ambiguous when all four targets are present', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.github/agents')
    await ensureDir(root, '.cursor')
    await ensureDir(root, '.claude')
    await ensureDir(root, '.agents')

    const result = await detector.detect(root)

    expect(result.status).toBe('ambiguous')
    expect(result.suggestedTarget).toBeUndefined()
    expect(result.detected).toEqual([
      'github-copilot',
      'claude-code',
      'cursor',
      'openai-codex',
    ])
  })

  it('throws when project root does not exist', async () => {
    const missingRoot = path.join(os.tmpdir(), `agents-missing-${Date.now()}`)

    await expect(detector.detect(missingRoot)).rejects.toBeInstanceOf(TargetDetectionError)
    await expect(detector.detect(missingRoot)).rejects.toMatchObject({
      code: 'project_root_unavailable',
      exitCode: 3,
    })
  })

  it('throws when project root is not a directory', async () => {
    const root = await createProjectRoot()
    const filePath = path.join(root, 'not-a-directory')
    await writeFile(filePath, 'not a directory\n', 'utf8')

    await expect(detector.detect(filePath)).rejects.toMatchObject({
      code: 'project_root_unavailable',
      exitCode: 3,
    })
  })

  it('throws when project root path crosses a file segment', async () => {
    const root = await createProjectRoot()
    const filePath = path.join(root, 'blocking-file')
    await writeFile(filePath, 'blocks traversal\n', 'utf8')
    const invalidRoot = path.join(filePath, 'nested-project')

    await expect(detector.detect(invalidRoot)).rejects.toMatchObject({
      code: 'project_root_unavailable',
      exitCode: 3,
    })
  })

  it('skips markers the probe cannot read', async () => {
    const root = await createProjectRoot()
    await ensureDir(root, '.cursor')

    const probe: TargetMarkerProbe = {
      isDirectory: async (absolutePath) => {
        if (absolutePath.endsWith(`${path.sep}.cursor`)) {
          return false
        }

        return defaultMarkerProbe.isDirectory(absolutePath)
      },
      isFile: (absolutePath) => defaultMarkerProbe.isFile(absolutePath),
    }

    const result = await new ProjectTargetDetector(probe).detect(root)
    expect(result.status).toBe('none')
  })

  it('does not match github-copilot when .github/agents is a file', async () => {
    const root = await createProjectRoot()
    await ensureFile(root, '.github/agents')

    const result = await detector.detect(root)
    expect(result.detected).not.toContain('github-copilot')
  })
})
