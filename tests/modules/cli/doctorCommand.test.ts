import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PackageManifest } from '../../../src/modules/registry/domain/manifest.js';
import {
  buildCursorSkillZip,
  makeDualPackageInstallCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  withInstallTestArtifactSha256,
} from '../../fixtures/installFixtures.js';

const nodeExecutable = process.execPath;
const binPath = path.resolve(process.cwd(), 'dist/bin/agents-repo.js');

const zipBytes = buildCursorSkillZip();
const sha256 = createHash('sha256').update(zipBytes).digest('hex');
const mockManifest: PackageManifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sha256);

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

const writeHealthyProject = (cwd: string, baseUrl: string): void => {
  writeFileSync(
    path.join(cwd, 'agents.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      registry: { url: baseUrl, ref: 'v2.0.0' },
      targets: ['cursor'],
      packages: {
        'agents-repo/sample-agent': '^1.0.0',
      },
    }),
  );
};

describe('doctor command subprocess with mock registry', () => {
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

      if (url.includes('/agents-repo/sample-agent/') && url.includes('/metadata.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(makeInstallTestMetadata()));
        return;
      }

      if (url.includes('/agents-repo/sample-agent/') && url.includes('1.0.0-cursor.zip')) {
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

  it('exits 0 after install when all checks pass', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-ok-'));
    tempDirs.push(cwd);
    writeHealthyProject(cwd, mockBaseUrl);

    const installResult = await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });
    expect(installResult.status).toBe(0);

    const doctorResult = await runCliSubprocess(['doctor'], { cwd });
    expect(doctorResult.status).toBe(0);
    expect(doctorResult.stdout).toContain('ok install_paths');
  });

  it('emits command doctor in JSON success output', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-json-'));
    tempDirs.push(cwd);
    writeHealthyProject(cwd, mockBaseUrl);

    await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    const doctorResult = await runCliSubprocess(['--json', 'doctor'], { cwd });
    expect(doctorResult.status).toBe(0);

    const payload = JSON.parse(doctorResult.stdout.trim()) as {
      command?: string;
      checks: { id: string; status: string }[];
    };
    expect(payload.command).toBe('doctor');
    expect(payload.checks.some((check) => check.id === 'registry_reachable' && check.status === 'pass')).toBe(
      true,
    );
  });

  it('exits 3 when agents-lock.json is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-no-lock-'));
    tempDirs.push(cwd);
    writeHealthyProject(cwd, mockBaseUrl);

    const doctorResult = await runCliSubprocess(['doctor'], { cwd });
    expect(doctorResult.status).toBe(3);
    expect(doctorResult.stdout).toContain('fail lock_present');
  });

  it('exits 3 with install_paths when extracted files are missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-missing-paths-'));
    tempDirs.push(cwd);
    writeHealthyProject(cwd, mockBaseUrl);

    await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });
    rmSync(path.join(cwd, '.cursor'), { recursive: true, force: true });

    const doctorResult = await runCliSubprocess(['doctor'], { cwd });
    expect(doctorResult.status).toBe(3);
    expect(doctorResult.stdout).toContain('fail install_paths');
    expect(doctorResult.stdout).toContain('install_paths_missing');
  });

  it('exits 3 with missing_target when targets are not configured', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-no-target-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
        },
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
                artifact: '1.0.0-cursor.zip',
                integrity: `sha256-${sha256}`,
              },
            },
          },
        },
      }),
    );

    const doctorResult = await runCliSubprocess(['doctor'], { cwd });
    expect(doctorResult.status).toBe(3);
    expect(doctorResult.stdout).toContain('fail targets_configured');
    expect(doctorResult.stdout).toContain('skip lock_config_sync');
  });

  it('skips registry_reachable when agents.json cannot be parsed', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-bad-config-'));
    tempDirs.push(cwd);

    writeFileSync(path.join(cwd, 'agents.json'), '{ not valid json');

    const doctorResult = await runCliSubprocess(['doctor'], { cwd });
    expect(doctorResult.status).toBe(3);
    expect(doctorResult.stdout).toContain('fail config_schema');
    expect(doctorResult.stdout).toContain('skip registry_reachable');
    expect(doctorResult.stdout).not.toContain('ok registry_reachable');
  });

  it('exits 1 when registry is unreachable', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-registry-down-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'http://127.0.0.1:1/?ref=v2.0.0', ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {},
      }),
    );

    writeFileSync(
      path.join(cwd, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 2,
        resolvedRef: 'v2.0.0',
        packages: {},
      }),
    );

    const doctorResult = await runCliSubprocess(['doctor'], { cwd });
    expect(doctorResult.status).toBe(1);
    expect(doctorResult.stdout).toContain('fail registry_reachable');
  });

  it('reports lock_config_package_drift without failing fast on registry check', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-cli-drift-'));
    tempDirs.push(cwd);
    writeHealthyProject(cwd, mockBaseUrl);

    await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<string, unknown>;
    };
    lock.packages['agents-repo/orphan'] = lock.packages['agents-repo/sample-agent'];
    writeFileSync(path.join(cwd, 'agents-lock.json'), JSON.stringify(lock));

    const doctorResult = await runCliSubprocess(['doctor'], { cwd });
    expect(doctorResult.status).toBe(3);
    expect(doctorResult.stdout).toContain('fail lock_config_sync');
    expect(doctorResult.stdout).toContain('ok registry_reachable');
  });
});
