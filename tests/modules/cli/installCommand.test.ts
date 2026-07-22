import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCursorSkillZip,
  makeInstallTestCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  withInstallTestArtifactSha256,
} from '../../fixtures/installFixtures.js';
import { conflictingTopLevelConfig } from '../../fixtures/agentsJson/index.js';

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

const startMockRegistry = async (): Promise<{ server: Server; baseUrl: string }> => {
  const zipBytes = buildCursorSkillZip();
  const sha256 = createHash('sha256').update(zipBytes).digest('hex');
  const manifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sha256);

  const server = createServer((request, response) => {
    const url = request.url ?? '/';

    if (url.includes('/packages/index.json')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(makeInstallTestCatalog()));
      return;
    }

    if (url.includes('/versions/manifest.json')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(manifest));
      return;
    }

    if (url.includes('/metadata.json')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(makeInstallTestMetadata()));
      return;
    }

    if (url.includes('1.0.0-cursor.zip')) {
      response.writeHead(200);
      response.end(zipBytes);
      return;
    }

    response.writeHead(404);
    response.end('not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to bind mock registry server');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/?ref=v2.0.0`,
  };
};

const stopMockRegistry = async (server: Server): Promise<void> => {
  server.closeAllConnections?.();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

describe('install command subprocess', () => {
  const tempDirs: string[] = [];
  let mockServer: Server | undefined;

  afterEach(async () => {
    if (mockServer !== undefined) {
      await stopMockRegistry(mockServer);
      mockServer = undefined;
    }

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 3 when install target is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-missing-target-'));
    tempDirs.push(cwd);

    const result = await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('Install target is required');
  });

  it('exits 2 when package id is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-missing-package-'));
    tempDirs.push(cwd);

    const result = await runCliSubprocess(['install'], { cwd });

    expect(result.status).toBe(2);
    expect(`${result.stdout}${result.stderr}`).toMatch(/missing required argument|not enough arguments/i);
  });

  it('exits 4 for dual-definition conflicts without --yes', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-conflict-'));
    tempDirs.push(cwd);

    writeFileSync(path.join(cwd, 'agents.json'), JSON.stringify(conflictingTopLevelConfig));

    const result = await runCliSubprocess(
      ['install', 'agents-repo/sample-agent', '--target', 'cursor'],
      { cwd },
    );

    expect(result.status).toBe(4);
    expect(result.stderr).toContain('dual definition');
  });

  it('supports dry-run without writing lock files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-dry-run-'));
    tempDirs.push(cwd);
    const mock = await startMockRegistry();
    mockServer = mock.server;

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mock.baseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {},
      }),
    );

    const result = await runCliSubprocess(['--dry-run', 'install', 'agents-repo/sample-agent'], {
      cwd,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Would install');
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();
  });

  it('emits JSON output on success when --json is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-json-'));
    tempDirs.push(cwd);
    const mock = await startMockRegistry();
    mockServer = mock.server;

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mock.baseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {},
      }),
    );

    const result = await runCliSubprocess(
      ['--json', '--dry-run', 'install', 'agents-repo/sample-agent'],
      { cwd },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim()) as {
      packageId: string
      dryRun: boolean
      saved: boolean
    }
    expect(payload.packageId).toBe('agents-repo/sample-agent');
    expect(payload.dryRun).toBe(true);
    expect(payload.saved).toBe(false);
  });

  it('installs globally without writing project config or lock files', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-home-'));
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-global-'));
    tempDirs.push(cwd);
    tempDirs.push(homeDir);
    const mock = await startMockRegistry();
    mockServer = mock.server;

    const configPath = path.join(cwd, 'agents.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mock.baseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {},
      }),
    );

    const result = await runCliSubprocess(
      ['install', '-g', 'agents-repo/sample-agent', '--target', 'cursor'],
      {
        cwd,
        env: {
          ...process.env,
          HOME: homeDir,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Installed agents-repo/sample-agent@1.0.0');
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      schemaVersion: '1.0.0',
      registry: { url: mock.baseUrl, ref: 'v2.0.0' },
      target: 'cursor',
      packages: {},
    });
    expect(
      readFileSync(path.join(homeDir, '.config/agents-repo/.cursor/skills/sample/SKILL.md'), 'utf8'),
    ).toContain('name: sample');
  });

  it('installs with --target override in an empty directory', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-target-'));
    tempDirs.push(cwd);
    const mock = await startMockRegistry();
    mockServer = mock.server;

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mock.baseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {},
      }),
    );

    const result = await runCliSubprocess(
      ['install', 'agents-repo/sample-agent', '--target', 'cursor'],
      { cwd },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Installed agents-repo/sample-agent@1.0.0');
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain(
      'name: sample',
    );
  });
});
