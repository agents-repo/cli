import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js';
import { createCliProgram } from '../../../src/modules/cli/presentation/createCliProgram.js';

const nodeExecutable = process.execPath;
const binPath = path.resolve(process.cwd(), 'dist/bin/agents-repo.js');

interface CliRunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const runCliSubprocess = async (
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv },
): Promise<CliRunResult> => {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(nodeExecutable, [binPath, ...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
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

describe('targets command', () => {
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

  const runTargets = async (args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> => {
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

  it('prints empty message when targets are not configured', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-targets-empty-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        packages: {},
      }),
    );

    const { stdout } = await runTargets(['targets'], cwd);

    expect(stdout).toContain('No install targets configured.');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints one target id per line', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-targets-text-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        targets: ['github-copilot', 'cursor'],
        packages: {},
      }),
    );

    const { stdout } = await runTargets(['targets'], cwd);

    expect(stdout).toBe('github-copilot\ncursor\n');
  });

  it('emits JSON when --json is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-targets-json-'));
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

    const { stdout } = await runTargets(['--json', 'targets'], cwd);
    const payload = JSON.parse(stdout.trim()) as {
      scope: string;
      gateMode: string;
      targets: string[];
    };

    expect(payload.scope).toBe('project');
    expect(payload.gateMode).toBe('top-level-ours');
    expect(payload.targets).toEqual(['cursor']);
  });

  it('reads global agents.json with -g', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-targets-global-home-'));
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-targets-global-cwd-'));
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
        packages: {},
      }),
    );

    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      const { stdout } = await runTargets(['targets', '-g'], cwd);
      expect(stdout).toBe('cursor\n');
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it('waives dual-definition mismatch with --yes', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-targets-yes-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        targets: ['cursor'],
        packages: {},
        registry: {
          url: 'https://registry-proxy.maiconfz.workers.dev',
          ref: 'v2.x',
        },
        '@agents-repo': {
          targets: ['claude-code'],
        },
      }),
    );

    const { stdout, stderr } = await runTargets(['--yes', 'targets'], cwd);

    expect(stdout).toBe('cursor\n');
    expect(stderr).toMatch(/warning:/);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('targets command subprocess', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 3 when agents.json uses deprecated target field', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-targets-legacy-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        target: 'cursor',
        packages: {},
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
      }),
    );

    const result = await runCliSubprocess(['targets'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/deprecated/i);
  });
});
