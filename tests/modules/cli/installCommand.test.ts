import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PackageManifest } from '../../../src/modules/registry/domain/manifest.js';
import {
  buildCursorSkillZip,
  buildOtherCursorSkillZip,
  makeDualPackageInstallCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  makeInstallTestOtherManifest,
  withInstallTestArtifactSha256,
} from '../../fixtures/installFixtures.js';
import { conflictingTopLevelConfig } from '../../fixtures/agentsJson/index.js';

const nodeExecutable = process.execPath;
const binPath = path.resolve(process.cwd(), 'dist/bin/agents-repo.js');

const zipBytes = buildCursorSkillZip();
const otherZipBytes = buildOtherCursorSkillZip();
const sha256 = createHash('sha256').update(zipBytes).digest('hex');
const otherSha256 = createHash('sha256').update(otherZipBytes).digest('hex');
const mockManifest: PackageManifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sha256);
const mockOtherManifest: PackageManifest = withInstallTestArtifactSha256(
  makeInstallTestOtherManifest(),
  otherSha256,
);

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

const writeInstallConfig = (cwd: string, baseUrl: string): void => {
  writeFileSync(
    path.join(cwd, 'agents.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      registry: { url: baseUrl, ref: 'v2.0.0' },
      targets: ['cursor'],
      packages: {},
    }),
  );
};

const writeGlobalInstallConfig = (
  homeDir: string,
  baseUrl: string,
  packages: Record<string, string> = {},
): void => {
  const globalRoot = path.join(homeDir, '.agents-repo');
  mkdirSync(globalRoot, { recursive: true });
  writeFileSync(
    path.join(globalRoot, 'agents.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      registry: { url: baseUrl, ref: 'v2.0.0' },
      targets: ['cursor'],
      packages,
    }),
  );
};

describe('install command subprocess', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 3 when install target is missing on bulk install', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-missing-target-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    );

    const result = await runCliSubprocess(['install'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/Install target (is required|could not be detected)/);
  });

  it('exits 3 when install target is missing for single package install', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-missing-target-single-'));
    tempDirs.push(cwd);

    const result = await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/Install target (is required|could not be detected)/);
  });

  it('exits 0 when bulk install has an empty packages map', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-bulk-empty-'));
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

    const result = await runCliSubprocess(['install'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exits 4 for dual-definition conflicts without --yes', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-conflict-'));
    tempDirs.push(cwd);

    writeFileSync(path.join(cwd, 'agents.json'), JSON.stringify(conflictingTopLevelConfig));

    const result = await runCliSubprocess(
      ['install', 'agents-repo/sample-agent'],
      { cwd },
    );

    expect(result.status).toBe(4);
    expect(result.stderr).toContain('dual definition');
  });
});

describe('install command subprocess with mock registry', () => {
  const tempDirs: string[] = [];
  let mockServer: Server;
  let mockBaseUrl: string;

  beforeAll(async () => {
    const server = createServer((request, response) => {
      const url = request.url ?? '/';

      if (url.includes('/packages/index.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(makeDualPackageInstallCatalog()));
        return;
      }

      if (url.includes('/agents-repo/sample-agent/versions/manifest.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(mockManifest));
        return;
      }

      if (url.includes('/agents-repo/other-agent/versions/manifest.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(mockOtherManifest));
        return;
      }

      if (url.includes('/agents-repo/sample-agent/') && url.includes('/metadata.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(makeInstallTestMetadata()));
        return;
      }

      if (url.includes('/agents-repo/other-agent/') && url.includes('/metadata.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            ...makeInstallTestMetadata(),
            name: 'other-agent',
          }),
        );
        return;
      }

      if (url.includes('/agents-repo/sample-agent/') && url.includes('1.0.0-cursor.zip')) {
        response.writeHead(200);
        response.end(zipBytes);
        return;
      }

      if (url.includes('/agents-repo/other-agent/') && url.includes('1.0.0-cursor.zip')) {
        response.writeHead(200);
        response.end(otherZipBytes);
        return;
      }

      if (url.includes('/versions/manifest.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(mockManifest));
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

    mockServer = server;
    mockBaseUrl = `http://127.0.0.1:${address.port}/?ref=v2.0.0`;
  });

  afterAll(async () => {
    mockServer.closeAllConnections?.();

    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('installs all configured packages on bulk install', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-bulk-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    );

    const result = await runCliSubprocess(['install'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Installed agents-repo/other-agent@1.0.0');
    expect(result.stdout).toContain('Installed agents-repo/sample-agent@1.0.0');

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<string, { version: string }>
    };
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.0.0');
    expect(lock.packages['agents-repo/other-agent'].version).toBe('1.0.0');
  });

  it('emits deduped bulk JSON when --json is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-bulk-json-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    );

    const result = await runCliSubprocess(['--json', '--dry-run', 'install'], { cwd });

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim()) as {
      warnings: string[];
      packages: Array<{ packageId: string; dryRun: boolean; warnings: string[] }>;
    };
    expect(payload.packages).toHaveLength(2);
    expect(payload.packages.map((entry) => entry.packageId).sort((left, right) => left.localeCompare(right))).toEqual([
      'agents-repo/other-agent',
      'agents-repo/sample-agent',
    ]);
    expect(payload.packages.every((entry) => entry.dryRun)).toBe(true);
    expect(payload.packages.every((entry) => entry.warnings.length === 0)).toBe(true);
    expect(payload.warnings).toEqual([]);
  });

  it('supports dry-run without writing lock files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-dry-run-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const result = await runCliSubprocess(['--dry-run', 'install', 'agents-repo/sample-agent'], {
      cwd,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Would install');
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();
  });

  it('emits JSON output on success when --json is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-json-dry-run-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const result = await runCliSubprocess(
      ['--json', '--dry-run', 'install', 'agents-repo/sample-agent'],
      { cwd },
    );

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim()) as {
      packages: Array<{ packageId: string; dryRun: boolean; saved: boolean }>;
      warnings: string[];
    };
    expect(payload.packages[0]?.packageId).toBe('agents-repo/sample-agent');
    expect(payload.packages[0]?.dryRun).toBe(true);
    expect(payload.packages[0]?.saved).toBe(false);
    expect(payload.warnings).toEqual([]);
    expect(result.stderr).not.toMatch(/^warning:/m);
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();
  });

  it('bootstraps agents.json on greenfield install when targets are detected', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-greenfield-bootstrap-'));
    tempDirs.push(cwd);
    mkdirSync(path.join(cwd, '.cursor'), { recursive: true });

    const result = await runCliSubprocess(['install', 'agents-repo/sample-agent'], {
      cwd,
      env: { ...process.env, AGENTS_REPO_REGISTRY_URL: mockBaseUrl },
    });

    expect(result.status).toBe(0);
    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      targets: string[];
      packages: Record<string, string>;
    };
    expect(config.targets).toEqual(['cursor']);
    expect(config.packages['agents-repo/sample-agent']).toBe('^1.0.0');
  });

  it('installs into a project and updates config and lock files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-project-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const result = await runCliSubprocess(
      ['install', 'agents-repo/sample-agent'],
      { cwd },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Installed agents-repo/sample-agent@1.0.0');
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain(
      'name: sample',
    );

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      packages: Record<string, string>
    };
    expect(config.packages['agents-repo/sample-agent']).toBe('^1.0.0');

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<string, { version: string }>
    };
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.0.0');
  });

  it('extracts without saving when --no-save is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-no-save-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const result = await runCliSubprocess(
      ['--no-save', 'install', 'agents-repo/sample-agent'],
      { cwd },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('(not saved)');
    expect(readFileSync(path.join(cwd, '.cursor/skills/sample/SKILL.md'), 'utf8')).toContain(
      'name: sample',
    );
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();
    expect(
      JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as { packages: Record<string, string> },
    ).toEqual({
      schemaVersion: '1.0.0',
      registry: { url: mockBaseUrl, ref: 'v2.0.0' },
      targets: ['cursor'],
      packages: {},
    });
  });

  it('installs globally without writing project config or lock files', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-home-'));
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-global-'));
    tempDirs.push(cwd);
    tempDirs.push(homeDir);

    const configPath = path.join(cwd, 'agents.json');
    writeInstallConfig(cwd, mockBaseUrl);
    writeGlobalInstallConfig(homeDir, mockBaseUrl);

    const result = await runCliSubprocess(
      ['install', '-g', 'agents-repo/sample-agent'],
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
      registry: { url: mockBaseUrl, ref: 'v2.0.0' },
      targets: ['cursor'],
      packages: {},
    });
    expect(
      readFileSync(path.join(homeDir, '.agents-repo/.cursor/skills/sample/SKILL.md'), 'utf8'),
    ).toContain('name: sample');
  });

  it('list reflects project install from agents-lock.json', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-then-list-project-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const installResult = await runCliSubprocess(
      ['install', 'agents-repo/sample-agent'],
      { cwd },
    );
    expect(installResult.status).toBe(0);

    const listResult = await runCliSubprocess(['list'], { cwd });
    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain('agents-repo/sample-agent@1.0.0  target=cursor');
  });

  it('list -g reflects global install from agents-lock.json in agents repo home', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-install-then-list-global-home-'));
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-then-list-global-cwd-'));
    tempDirs.push(cwd);
    tempDirs.push(homeDir);
    writeInstallConfig(cwd, mockBaseUrl);
    writeGlobalInstallConfig(homeDir, mockBaseUrl);

    const env = { ...process.env, HOME: homeDir };
    const installResult = await runCliSubprocess(
      ['install', '-g', 'agents-repo/sample-agent'],
      { cwd, env },
    );
    expect(installResult.status).toBe(0);

    const globalLockPath = path.join(homeDir, '.agents-repo', 'agents-lock.json');
    const globalLock = JSON.parse(readFileSync(globalLockPath, 'utf8')) as {
      packages: Record<string, { version: string }>;
    };
    expect(globalLock.packages['agents-repo/sample-agent']?.version).toBe('1.0.0');

    const listResult = await runCliSubprocess(['list', '-g'], { cwd, env });
    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain('agents-repo/sample-agent@1.0.0  target=cursor');
  });

  it('bulk install globally without writing project config or lock files', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-bulk-global-home-'));
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-install-cli-bulk-global-'));
    tempDirs.push(cwd);
    tempDirs.push(homeDir);

    const configPath = path.join(cwd, 'agents.json');
    const configBefore = {
      schemaVersion: '1.0.0',
      registry: { url: mockBaseUrl, ref: 'v2.0.0' },
      targets: ['cursor'],
      packages: {
        'agents-repo/sample-agent': '^1.0.0',
        'agents-repo/other-agent': '^1.0.0',
      },
    };
    writeFileSync(configPath, JSON.stringify(configBefore));
    writeGlobalInstallConfig(
      homeDir,
      mockBaseUrl,
      configBefore.packages,
    );

    const result = await runCliSubprocess(['--json', 'install', '-g'], {
      cwd,
      env: {
        ...process.env,
        HOME: homeDir,
      },
    });

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim()) as {
      packages: Array<{ saved: boolean; global: boolean }>;
    };
    expect(payload.packages).toHaveLength(2);
    expect(payload.packages.every((entry) => entry.saved === true && entry.global === true)).toBe(true);
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(configBefore);
    expect(
      readFileSync(path.join(homeDir, '.agents-repo/.cursor/skills/sample/SKILL.md'), 'utf8'),
    ).toContain('name: sample');
    expect(
      readFileSync(path.join(homeDir, '.agents-repo/.cursor/skills/other/SKILL.md'), 'utf8'),
    ).toContain('name: other');
  });
});
