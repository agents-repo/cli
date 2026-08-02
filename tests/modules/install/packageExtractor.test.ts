import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractPackageArtifact } from '../../../src/modules/install/infrastructure/packageExtractor.js'
import {
  assertZipEntryPathSafe,
  mapZipEntryToExtractPath,
  resolveContainedExtractPath,
} from '../../../src/modules/install/infrastructure/targetExtractPaths.js'
import {
  buildCursorSkillZip,
  buildGithubCopilotZip,
  buildTraversalZip,
} from '../../fixtures/installFixtures.js'

describe('targetExtractPaths', () => {
  it('remaps github-copilot agents paths under .github/agents', () => {
    expect(mapZipEntryToExtractPath('github-copilot', 'agents/sample.agent.md')).toBe(
      '.github/agents/sample.agent.md',
    )
  })

  it('keeps cursor paths unchanged', () => {
    expect(mapZipEntryToExtractPath('cursor', '.cursor/skills/sample/SKILL.md')).toBe(
      '.cursor/skills/sample/SKILL.md',
    )
  })

  it('rejects traversal segments in archive paths', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agents-extract-safe-root-'))
    try {
      expect(() => assertZipEntryPathSafe('../evil.txt')).toThrow(/Unsafe archive entry path/)
      expect(() => assertZipEntryPathSafe('safe/foo..bar/file.txt')).not.toThrow()
      expect(resolveContainedExtractPath(root, 'safe/nested/file.txt')).toBe(
        path.resolve(root, 'safe/nested/file.txt'),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('packageExtractor', () => {
  it('extracts cursor skill layout into the project root', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-cursor-'))

    try {
      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd)
      const content = readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')
      expect(content).toContain('name: sample')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('extracts github-copilot artifacts under .github/agents', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-copilot-'))

    try {
      await extractPackageArtifact(buildGithubCopilotZip(), 'github-copilot', '1.0.0', cwd)
      const content = readFileSync(path.join(cwd, '.github/agents/sample.agent.md'), 'utf8')
      expect(content).toContain('name: sample')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('rejects traversal entries before writing files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-traversal-'))

    try {
      await expect(
        extractPackageArtifact(buildTraversalZip(), 'cursor', '1.0.0', cwd),
      ).rejects.toThrow()
      expect(() => readFileSync(path.join(cwd, 'evil.agent.md'), 'utf8')).toThrow()
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('rejects extraction through existing symlinks under the extract root', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-symlink-root-'))
    const outside = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-symlink-outside-'))

    try {
      mkdirSync(path.join(root, '.cursor'), { recursive: true })
      symlinkSync(outside, path.join(root, '.cursor', 'skills'))

      await expect(
        extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', root),
      ).rejects.toMatchObject({ code: 'path_traversal' })
      expect(() => readFileSync(path.join(outside, 'sample', 'SKILL.md'), 'utf8')).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('skips extraction when destination files already match the artifact', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-idempotent-'))

    try {
      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd)
      const written = await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd)
      expect(written).toEqual([])
      const content = readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')
      expect(content).toContain('name: sample')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('rejects extraction when a destination file was modified at the same version', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-modified-'))

    try {
      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd)
      const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md')
      writeFileSync(skillPath, 'user-edited content\n')

      await expect(
        extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd),
      ).rejects.toMatchObject({ code: 'extract_modified' })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('overwrites modified files when forceSameVersion is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-force-'))

    try {
      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd)
      const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md')
      writeFileSync(skillPath, 'user-edited content\n')

      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd, {
        forceSameVersion: true,
      })
      const content = readFileSync(skillPath, 'utf8')
      expect(content).toContain('name: sample')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('overwrites differing files when overwriteOnMismatch is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-extract-overwrite-'))

    try {
      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd)
      const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md')
      writeFileSync(skillPath, 'stale version bytes\n')

      await extractPackageArtifact(buildCursorSkillZip(), 'cursor', '1.0.0', cwd, {
        overwriteOnMismatch: true,
      })
      const content = readFileSync(skillPath, 'utf8')
      expect(content).toContain('name: sample')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
