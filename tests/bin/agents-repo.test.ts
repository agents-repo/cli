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

  it('prints placeholder and exits 1 with no flags', () => {
    const result = spawnSync(nodeExecutable, [binPath], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('commands coming in M3');
  });
});
