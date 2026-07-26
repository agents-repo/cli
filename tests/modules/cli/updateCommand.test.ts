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

describe('update command subprocess', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 3 when install target is missing', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-missing-target-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    );

    const result = await runCliSubprocess(['update'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('Install target is required');
  });

  it('exits 0 when packages map is empty', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-empty-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: 'https://example.test', ref: 'v2.0.0' },
        target: 'cursor',
        packages: {},
      }),
    );

    const result = await runCliSubprocess(['update'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('update command subprocess with mock registry', () => {
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

  it('exits 3 when package-id is not configured', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-not-configured-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    );

    const result = await runCliSubprocess(['update', 'agents-repo/other-agent'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('not listed in agents.json packages');
  });

  it('exits 3 with package_not_configured for unknown package ids', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-unknown-id-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
    );

    const result = await runCliSubprocess(['update', 'agents-repo/unknown-agent'], { cwd });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('not listed in agents.json packages');
    expect(result.stderr).not.toContain('Package not found');
  });

  it('updates all configured packages', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-bulk-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    );

    const result = await runCliSubprocess(['update'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Updated agents-repo/other-agent@1.0.0');
    expect(result.stdout).toContain('Updated agents-repo/sample-agent@1.0.0');
  });

  it('supports the up alias', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-up-alias-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    );

    const result = await runCliSubprocess(['up'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Updated agents-repo/sample-agent@1.0.0');
  });

  it('updates a single configured package', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-single-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    );

    const result = await runCliSubprocess(['update', 'agents-repo/sample-agent'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Updated agents-repo/sample-agent@1.0.0');
    expect(result.stdout).not.toContain('other-agent');
  });

  it('emits deduped bulk JSON when --json is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-bulk-json-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
          'agents-repo/other-agent': '^1.0.0',
        },
      }),
    );

    const result = await runCliSubprocess(['--json', '--dry-run', 'update'], { cwd });

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim()) as {
      warnings: string[];
      packages: Array<{ packageId: string; dryRun: boolean }>;
    };
    expect(payload.packages).toHaveLength(2);
    expect(payload.packages.every((entry) => entry.dryRun)).toBe(true);
  });

  it('supports dry-run without writing lock files', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-dry-run-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    );

    const result = await runCliSubprocess(['--dry-run', 'update'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Would update');
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();
  });
});

describe('update command semver refresh with mock registry', () => {
  const tempDirs: string[] = [];
  let mockServer: Server;
  let mockBaseUrl: string;
  const zip110 = buildCursorSkillZip();
  const sha256110 = createHash('sha256').update(zip110).digest('hex');
  const bumpedManifest: PackageManifest = {
    schemaVersion: '1.1.0',
    name: 'sample-agent',
    latest: '1.1.0',
    versions: [
      {
        version: '1.0.0',
        artifacts: [
          {
            target: 'cursor',
            file: '1.0.0-cursor.zip',
            sha256,
          },
        ],
        srcArtifact: '1.0.0-src.zip',
        srcSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        version: '1.1.0',
        artifacts: [
          {
            target: 'cursor',
            file: '1.1.0-cursor.zip',
            sha256: sha256110,
          },
        ],
        srcArtifact: '1.1.0-src.zip',
        srcSha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ],
  };

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
        response.end(JSON.stringify(bumpedManifest));
        return;
      }

      if (url.includes('/agents-repo/sample-agent/') && url.includes('/metadata.json')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        const version = url.includes('/versions/1.1.0/') ? '1.1.0' : '1.0.0';
        response.end(
          JSON.stringify({
            ...makeInstallTestMetadata(),
            version,
          }),
        );
        return;
      }

      if (url.includes('1.0.0-cursor.zip')) {
        response.writeHead(200);
        response.end(zipBytes);
        return;
      }

      if (url.includes('1.1.0-cursor.zip')) {
        response.writeHead(200);
        response.end(zip110);
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

  it('updates lock to a newer version within semver range', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-update-cli-bump-'));
    tempDirs.push(cwd);

    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        target: 'cursor',
        packages: {
          'agents-repo/sample-agent': '^1.0.0',
        },
      }),
    );

    writeFileSync(
      path.join(cwd, 'agents-lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        resolvedRef: 'v2.0.0',
        packages: {
          'agents-repo/sample-agent': {
            version: '1.0.0',
            target: 'cursor',
            integrity: `sha256-${sha256}`,
            artifact: '1.0.0-cursor.zip',
          },
        },
      }),
    );

    const result = await runCliSubprocess(['update', 'agents-repo/sample-agent'], { cwd });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Updated agents-repo/sample-agent@1.1.0');

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<string, { version: string; integrity: string }>
    };
    expect(lock.packages['agents-repo/sample-agent'].version).toBe('1.1.0');
    expect(lock.packages['agents-repo/sample-agent'].integrity).toBe(`sha256-${sha256110}`);
  });
});
