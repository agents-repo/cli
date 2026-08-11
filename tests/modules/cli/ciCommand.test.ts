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
  buildOtherCursorSkillZip,
  makeDualPackageInstallCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  makeInstallTestOtherManifest,
  withInstallTestArtifactSha256,
} from '../../fixtures/installFixtures.js';

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

const writeDualPackageProject = (cwd: string, baseUrl: string): void => {
  writeFileSync(
    path.join(cwd, 'agents.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      registry: { url: baseUrl, ref: 'v2.0.0' },
      targets: ['cursor'],
      packages: {
        'agents-repo/sample-agent': '^1.0.0',
        'agents-repo/other-agent': '^1.0.0',
      },
    }),
  );
};

const writeJsonResponse = (response: import('node:http').ServerResponse, body: unknown): void => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

const writeBinaryResponse = (response: import('node:http').ServerResponse, body: Buffer): void => {
  response.writeHead(200);
  response.end(body);
};

const handleCiMockRegistryRequest = (
  url: string,
  response: import('node:http').ServerResponse,
): boolean => {
  if (url.includes('/packages/index.json')) {
    writeJsonResponse(response, makeDualPackageInstallCatalog());
    return true;
  }

  if (url.includes('/agents-repo/sample-agent/versions/manifest.json')) {
    writeJsonResponse(response, mockManifest);
    return true;
  }

  if (url.includes('/agents-repo/other-agent/versions/manifest.json')) {
    writeJsonResponse(response, mockOtherManifest);
    return true;
  }

  if (url.includes('/agents-repo/sample-agent/') && url.includes('/metadata.json')) {
    writeJsonResponse(response, makeInstallTestMetadata());
    return true;
  }

  if (url.includes('/agents-repo/other-agent/') && url.includes('/metadata.json')) {
    writeJsonResponse(response, {
      ...makeInstallTestMetadata(),
      name: 'other-agent',
    });
    return true;
  }

  if (url.includes('/agents-repo/sample-agent/') && url.includes('1.0.0-cursor.zip')) {
    writeBinaryResponse(response, zipBytes);
    return true;
  }

  if (url.includes('/agents-repo/other-agent/') && url.includes('1.0.0-cursor.zip')) {
    writeBinaryResponse(response, otherZipBytes);
    return true;
  }

  return false;
};

describe('ci command subprocess with mock registry', () => {
  const tempDirs: string[] = [];
  let mockServer: Server;
  let mockBaseUrl: string;

  beforeAll(async () => {
    const server = createServer((request, response) => {
      const url = request.url ?? '/';
      if (handleCiMockRegistryRequest(url, response)) {
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

  it('reinstalls from lock after install without changing lock file', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-cli-reinstall-'));
    tempDirs.push(cwd);
    writeDualPackageProject(cwd, mockBaseUrl);

    const installResult = await runCliSubprocess(['install'], { cwd });
    expect(installResult.status).toBe(0);

    const lockBefore = readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8');

    const ciResult = await runCliSubprocess(['ci'], { cwd });
    expect(ciResult.status).toBe(0);
    expect(ciResult.stdout).toContain('Installed agents-repo/sample-agent@1.0.0');
    expect(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toBe(lockBefore);
  });

  it('emits command ci in JSON success output', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-cli-json-'));
    tempDirs.push(cwd);
    writeDualPackageProject(cwd, mockBaseUrl);

    await runCliSubprocess(['install'], { cwd });

    const ciResult = await runCliSubprocess(['--json', 'ci'], { cwd });
    expect(ciResult.status).toBe(0);

    const payload = JSON.parse(ciResult.stdout.trim()) as {
      command?: string;
      packages: unknown[];
    };
    expect(payload.command).toBe('ci');
    expect(payload.packages).toHaveLength(2);
  });

  it('exits 3 with missing_by_target_slot in JSON stderr', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-cli-slot-json-'));
    tempDirs.push(cwd);
    writeDualPackageProject(cwd, mockBaseUrl);

    await runCliSubprocess(['install'], { cwd });

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      targets: string[];
    };
    config.targets = ['cursor', 'github-copilot'];
    writeFileSync(path.join(cwd, 'agents.json'), JSON.stringify(config));

    const ciResult = await runCliSubprocess(['--json', 'ci'], { cwd });
    expect(ciResult.status).toBe(3);

    const errorPayload = JSON.parse(ciResult.stderr.trim()) as {
      error: { code: string; message: string };
    };
    expect(errorPayload.error.code).toBe('missing_by_target_slot');
  });

  it('exits 3 when agents-lock.json is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-cli-no-lock-'));
    tempDirs.push(cwd);
    writeDualPackageProject(cwd, mockBaseUrl);

    const ciResult = await runCliSubprocess(['ci'], { cwd });
    expect(ciResult.status).toBe(3);
    expect(ciResult.stderr).toContain('agents-lock.json is missing');
  });

  it('exits 3 with lock_validation_error in JSON stderr when lock is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-cli-no-lock-json-'));
    tempDirs.push(cwd);
    writeDualPackageProject(cwd, mockBaseUrl);

    const ciResult = await runCliSubprocess(['--json', 'ci'], { cwd });
    expect(ciResult.status).toBe(3);

    const errorPayload = JSON.parse(ciResult.stderr.trim()) as {
      error: { code: string; message: string };
    };
    expect(errorPayload.error.code).toBe('lock_validation_error');
  });

  it('exits 0 with --force when lock version is outside agents.json range', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-ci-cli-force-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {
          'agents-repo/sample-agent': '^2.0.0',
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

    const withoutForce = await runCliSubprocess(['ci'], { cwd });
    expect(withoutForce.status).toBe(3);
    expect(withoutForce.stderr).toContain('lock_version_range_mismatch');

    rmSync(path.join(cwd, '.cursor'), { recursive: true, force: true });

    const withForce = await runCliSubprocess(['ci', '--force'], { cwd });
    expect(withForce.status).toBe(0);
    expect(withForce.stdout).toContain('Installed agents-repo/sample-agent@1.0.0');
  });
});
