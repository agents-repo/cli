import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js';
import { createCliProgram } from '../../../src/modules/cli/presentation/createCliProgram.js';
import { ListInstalledService } from '../../../src/modules/config/application/listInstalledService.js';

const nodeExecutable = process.execPath;
const binPath = path.resolve(process.cwd(), 'dist/bin/agents-repo.js');

interface CliRunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const runCliSubprocess = async (
  args: readonly string[],
  options: { readonly cwd: string },
): Promise<CliRunResult> => {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(nodeExecutable, [binPath, ...args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (status) => {
      resolve({
        status: status ?? 1,
        stdout,
        stderr,
      });
    });
  });
};

describe('list command', () => {
  const tempDirs: string[] = [];
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetCliGlobals();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const runList = async (args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> => {
    const previousCwd = process.cwd();
    if (cwd !== undefined) {
      process.chdir(cwd);
    }

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });

    try {
      const program = createCliProgram();
      await program.parseAsync(args, { from: 'user' });
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
      process.chdir(previousCwd);
    }

    return {
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
    };
  };

  it('prints empty message when project lock is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-list-empty-'));
    tempDirs.push(cwd);

    const { stdout } = await runList(['list'], cwd);

    expect(stdout).toContain('No installed packages found.');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('lists packages from project lock', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-list-project-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    );
    writeFileSync(
      path.join(cwd, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/sample-agent': {
            version: '1.0.0',
            byTarget: {
              cursor: {
                integrity: `sha256-${'a'.repeat(64)}`,
                artifact: '1.0.0-cursor.zip',
              },
            },
          },
        },
      }),
    );

    const { stdout } = await runList(['list'], cwd);

    expect(stdout).toContain('agents-repo/sample-agent@1.0.0  target=cursor');
  });

  it('emits JSON with range when --json is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-list-json-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    );
    writeFileSync(
      path.join(cwd, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/sample-agent': {
            version: '1.0.0',
            byTarget: {
              cursor: {
                integrity: `sha256-${'a'.repeat(64)}`,
                artifact: '1.0.0-cursor.zip',
              },
            },
          },
        },
      }),
    );

    const { stdout } = await runList(['--json', 'list'], cwd);
    const payload = JSON.parse(stdout.trim()) as {
      scope: string;
      packages: Array<{ id: string; range?: string }>;
    };

    expect(payload.scope).toBe('project');
    expect(payload.packages[0]?.id).toBe('agents-repo/sample-agent');
    expect(payload.packages[0]?.range).toBe('^1.0.0');
  });

  it('lists global packages from agents-lock.json under agents repo home', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-list-global-home-'));
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-list-global-cwd-'));
    tempDirs.push(homeDir);
    tempDirs.push(cwd);

    const globalDir = path.join(homeDir, '.agents-repo');
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      path.join(globalDir, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    );
    writeFileSync(
      path.join(globalDir, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/sample-agent': {
            version: '1.0.0',
            byTarget: {
              cursor: {
                integrity: `sha256-${'b'.repeat(64)}`,
                artifact: '1.0.0-cursor.zip',
              },
            },
          },
        },
      }),
    );

    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      const { stdout } = await runList(['list', '-g'], cwd);
      expect(stdout).toContain('agents-repo/sample-agent@1.0.0  target=cursor');
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it('runs ls alias', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-list-alias-'));
    tempDirs.push(cwd);

    const { stdout } = await runList(['ls'], cwd);

    expect(stdout).toContain('No installed packages found.');
  });
});

describe('list command subprocess', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 3 when agents-lock.json is invalid', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-list-invalid-lock-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {},
      }),
    );
    writeFileSync(
      path.join(cwd, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 99,
        resolvedRef: 'v2.0.0',
        packages: {},
      }),
    );

    const result = await runCliSubprocess(['list'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/lockfileVersion|Unsupported lockfileVersion/i);
  });
});

describe('ListInstalledService', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid global lock files', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-list-invalid-global-'));
    tempDirs.push(homeDir);

    const globalDir = path.join(homeDir, '.agents-repo');
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      path.join(globalDir, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {},
      }),
    );
    writeFileSync(
      path.join(globalDir, 'agents-lock.json'),
      JSON.stringify({ lockfileVersion: 99, resolvedRef: 'v2.0.0', packages: {} }),
    );

    const service = new ListInstalledService();
    await expect(
      service.run({ cwd: homeDir, env: { ...process.env, HOME: homeDir }, global: true }),
    ).rejects.toThrow(/lockfileVersion/);
  });
});
