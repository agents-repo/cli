import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
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
    expect(result.stdout).toContain('Usage: agents-repo');
  });

  it('prints placeholder and exits 1 for init', () => {
    const result = spawnSync(nodeExecutable, [binPath, 'init'], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not implemented yet');
    expect(result.stderr).toContain('issue #7');
  });
});
