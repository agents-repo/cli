import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const nodeExecutable = process.execPath;
const binPath = resolve(process.cwd(), 'dist/bin/agents-repo.js');

describe('agents-repo bin', () => {
  it('prints version and exits 0 with --version', () => {
    const stdout = execFileSync(nodeExecutable, [binPath, '--version'], { encoding: 'utf8' });

    expect(stdout.trim()).toBe('0.0.0');
  });

  it('prints help and exits 0 with --help', () => {
    const result = spawnSync(nodeExecutable, [binPath, '--help'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('agents-repo');
    expect(result.stdout).toContain('init');
  });

  it('prints root help and exits 0 with no flags', () => {
    const result = spawnSync(nodeExecutable, [binPath], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('Usage: agents-repo');
  });

  it('exits 2 for unknown root flags', () => {
    const result = spawnSync(nodeExecutable, [binPath, '--unknown'], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown option');
  });

  it('exits 2 for unknown commands', () => {
    const result = spawnSync(nodeExecutable, [binPath, 'foo'], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown command 'foo'");
  });

  it('exits 2 for unknown subcommand flags', () => {
    const result = spawnSync(nodeExecutable, [binPath, 'install', '--unknown'], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown option');
  });

  it('creates agents.json with init --target', () => {
    const cwd = mkdtempSync(join(os.tmpdir(), 'agents-init-bin-'));

    try {
      const result = spawnSync(
        nodeExecutable,
        [binPath, 'init', '--target', 'cursor'],
        { cwd, encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('agents.json');
      expect(result.stdout).toContain('cursor');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('runs install alias i as placeholder', () => {
    const result = spawnSync(nodeExecutable, [binPath, 'i'], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('install is not implemented yet');
    expect(result.stderr).toContain('issue #8');
  });
});
