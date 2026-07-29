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
  makeDualPackageInstallCatalog,
  makeInstallTestManifest,
  makeInstallTestMetadata,
  withInstallTestArtifactSha256,
} from '../../fixtures/installFixtures.js';
import {
  resolveArtifactExtractPaths,
} from '../../../src/modules/install/infrastructure/artifactExtractPaths.js';
import { extractPackageArtifact } from '../../../src/modules/install/infrastructure/packageExtractor.js';

const zipBytes = buildCursorSkillZip();
const sha256 = createHash('sha256').update(zipBytes).digest('hex');
const mockManifest: PackageManifest = withInstallTestArtifactSha256(makeInstallTestManifest(), sha256);

describe('artifactExtractPaths', () => {
  it('lists the same absolute paths as extractPackageArtifact writes', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agents-extract-paths-'));

    const listed = resolveArtifactExtractPaths(zipBytes, 'cursor', '1.0.0', root);
    const written = await extractPackageArtifact(zipBytes, 'cursor', '1.0.0', root);

    expect([...listed].sort((left, right) => left.localeCompare(right))).toEqual(
      [...written].sort((left, right) => left.localeCompare(right)),
    );

    rmSync(root, { recursive: true, force: true });
  });
});

interface CliRunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const nodeExecutable = process.execPath;
const binPath = path.resolve(process.cwd(), 'dist/bin/agents-repo.js');

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
    JSON.stringify(
      {
        schemaVersion: '1.0.0',
        registry: { url: baseUrl, ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      },
      null,
      2,
    ),
    'utf8',
  );
};

describe('remove command subprocess with mock registry', () => {
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

  it('removes installed package files and updates config and lock', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-cli-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const installResult = await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });
    expect(installResult.status).toBe(0);

    const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md');
    expect(readFileSync(skillPath, 'utf8')).toContain('name: sample');

    const removeResult = await runCliSubprocess(['remove', 'agents-repo/sample-agent'], { cwd });
    expect(removeResult.status).toBe(0);
    expect(removeResult.stdout).toContain('Removed agents-repo/sample-agent@1.0.0');
    expect(() => readFileSync(skillPath, 'utf8')).toThrow();

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      packages: Record<string, string>;
    };
    expect(config.packages['agents-repo/sample-agent']).toBeUndefined();

    const lock = JSON.parse(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')) as {
      packages: Record<string, unknown>;
    };
    expect(lock.packages['agents-repo/sample-agent']).toBeUndefined();
  });

  it('exits 3 when package is not in lock', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-missing-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const result = await runCliSubprocess(['remove', 'agents-repo/sample-agent'], { cwd });
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('not present in agents-lock.json');
  });

  it('dry-run does not delete files or update lock', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-dry-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);
    mkdirSync(path.join(cwd, '.cursor'), { recursive: true });

    await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md');
    const lockBefore = readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8');

    const result = await runCliSubprocess(
      ['--dry-run', 'remove', 'agents-repo/sample-agent'],
      { cwd },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Would remove');
    expect(readFileSync(skillPath, 'utf8')).toContain('name: sample');
    expect(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toBe(lockBefore);
  });
});
