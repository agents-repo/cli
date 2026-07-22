import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { conflictingTopLevelConfig } from '../../fixtures/agentsJson/index.js';

const nodeExecutable = process.execPath;
const binPath = path.resolve(process.cwd(), 'dist/bin/agents-repo.js');

describe('init command subprocess', () => {
  it('creates agents.json with --target in an empty directory', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-init-cli-'));

    try {
      const stdout = execFileSync(
        nodeExecutable,
        [binPath, 'init', '--target', 'cursor'],
        { cwd, encoding: 'utf8' },
      );

      expect(stdout).toContain('agents.json');
      expect(stdout).toContain('cursor');

      const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as Record<
        string,
        unknown
      >;

      expect(config.target).toBe('cursor');
      expect(config.schemaVersion).toBe('1.0.0');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('accepts global -y flag without error before subcommand', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-init-cli-yes-'));

    try {
      const stdout = execFileSync(nodeExecutable, [binPath, '-y', 'init', '--target', 'cursor'], {
        cwd,
        encoding: 'utf8',
      });

      expect(stdout).toContain('agents.json');
      expect(stdout).toContain('cursor');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('accepts init -y flag after subcommand', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-init-cli-init-yes-'));

    try {
      writeFileSync(path.join(cwd, 'agents.json'), JSON.stringify(conflictingTopLevelConfig));

      const stdout = execFileSync(
        nodeExecutable,
        [binPath, 'init', '-y', '--target', 'cursor'],
        { cwd, encoding: 'utf8' },
      );

      expect(stdout).toContain('agents.json');
      expect(stdout).toContain('warning(s)');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('exits 3 when target cannot be resolved', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-init-cli-missing-target-'));

    try {
      const result = spawnSync(nodeExecutable, [binPath, 'init'], {
        cwd,
        encoding: 'utf8',
      });

      expect(result.status).toBe(3);
      expect(result.stderr).toContain('--target');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('exits 4 for dual-definition conflicts without --yes', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-init-cli-conflict-'));

    try {
      writeFileSync(path.join(cwd, 'agents.json'), JSON.stringify(conflictingTopLevelConfig));

      const result = spawnSync(nodeExecutable, [binPath, 'init', '--target', 'cursor'], {
        cwd,
        encoding: 'utf8',
      });

      expect(result.status).toBe(4);
      expect(result.stderr).toContain('dual definition');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('exits 3 when multiple install targets are detected', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-init-cli-ambiguous-'));

    try {
      mkdirSync(path.join(cwd, '.cursor'), { recursive: true });
      mkdirSync(path.join(cwd, '.claude'), { recursive: true });

      const result = spawnSync(nodeExecutable, [binPath, 'init'], {
        cwd,
        encoding: 'utf8',
      });

      expect(result.status).toBe(3);
      expect(result.stderr).toContain('Multiple install targets detected');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
