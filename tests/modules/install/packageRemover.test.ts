import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildCursorSkillZip } from '../../fixtures/installFixtures.js';
import { planArtifactExtractFromZip } from '../../../src/modules/install/infrastructure/artifactExtractPaths.js';
import {
  isBlockingRemoveWarning,
  removeInstalledFiles,
  restoreRemovedSlotFiles,
} from '../../../src/modules/install/infrastructure/packageRemover.js';
import { InstallRuntimeError } from '../../../src/modules/install/domain/installErrors.js';

describe('packageRemover', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats modified-file and non-file warnings as blocking', () => {
    expect(isBlockingRemoveWarning('Skipped modified file (use --force to delete): a')).toBe(true);
    expect(isBlockingRemoveWarning('Skipped non-file path: b')).toBe(true);
    expect(isBlockingRemoveWarning('Digest missing for path: c')).toBe(true);
    expect(isBlockingRemoveWarning('File already absent: d')).toBe(false);
  });

  it('skips modified files unless force is set', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agents-remover-mod-'));
    tempDirs.push(root);
    const zipBytes = buildCursorSkillZip();
    const plan = planArtifactExtractFromZip(zipBytes, 'cursor', '1.0.0', root);
    const targetPath = path.join(root, '.cursor/skills/sample/SKILL.md');
    expect(plan.absolutePaths).toContain(targetPath);

    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, 'tampered content', 'utf8');

    const soft = await removeInstalledFiles(
      plan.absolutePaths,
      root,
      'cursor',
      plan.digestByRelativePath,
    );
    expect(soft.deletedPaths).toHaveLength(0);
    expect(soft.warnings.some(isBlockingRemoveWarning)).toBe(true);
    expect(readFileSync(targetPath, 'utf8')).toBe('tampered content');

    const forced = await removeInstalledFiles(
      plan.absolutePaths,
      root,
      'cursor',
      plan.digestByRelativePath,
      { force: true },
    );
    expect(forced.deletedPaths).toHaveLength(1);
  });

  it('restores files removed from a slot', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agents-remover-restore-'));
    tempDirs.push(root);
    const zipBytes = buildCursorSkillZip();
    const plan = planArtifactExtractFromZip(zipBytes, 'cursor', '1.0.0', root);
    const targetPath = path.join(root, '.cursor/skills/sample/SKILL.md');
    expect(plan.absolutePaths).toContain(targetPath);

    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, 'original', 'utf8');

    const { deletedPaths } = await removeInstalledFiles(
      plan.absolutePaths,
      root,
      'cursor',
      plan.digestByRelativePath,
      { force: true },
    );

    expect(() => readFileSync(targetPath, 'utf8')).toThrow();

    await restoreRemovedSlotFiles({
      zipBytes,
      targetId: 'cursor',
      version: '1.0.0',
      extractRoot: root,
      deletedPaths,
    });

    expect(readFileSync(targetPath, 'utf8')).toContain('name: sample');
  });

  it('refuses to delete paths outside extractRoot', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agents-remover-outside-'));
    tempDirs.push(root);
    const zipBytes = buildCursorSkillZip();
    const plan = planArtifactExtractFromZip(zipBytes, 'cursor', '1.0.0', root);
    const outsidePath = path.join(os.tmpdir(), 'agents-remover-outside-target.txt');
    writeFileSync(outsidePath, 'outside', 'utf8');

    await expect(
      removeInstalledFiles([outsidePath], root, 'cursor', plan.digestByRelativePath),
    ).rejects.toBeInstanceOf(InstallRuntimeError);

    rmSync(outsidePath, { force: true });
  });
});
