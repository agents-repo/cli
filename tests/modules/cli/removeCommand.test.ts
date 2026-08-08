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
    expect(written.writtenPaths.length).toBeGreaterThan(0);

    expect([...listed].sort((left, right) => left.localeCompare(right))).toEqual(
      [...written.writtenPaths].sort((left, right) => left.localeCompare(right)),
    )

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

  it('supports the unlink npm parity alias', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-cli-unlink-alias-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const installResult = await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });
    expect(installResult.status).toBe(0);

    const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md');
    expect(readFileSync(skillPath, 'utf8')).toContain('name: sample');

    const removeResult = await runCliSubprocess(['unlink', 'agents-repo/sample-agent'], { cwd });
    expect(removeResult.status).toBe(0);
    expect(removeResult.stdout).toContain('Removed agents-repo/sample-agent@1.0.0');
    expect(() => readFileSync(skillPath, 'utf8')).toThrow();
  });

  it('exits 3 when package is not in lock', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-missing-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    const result = await runCliSubprocess(['remove', 'agents-repo/sample-agent'], { cwd });
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('agents-lock.json is missing');
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

  it('does not update config when --no-save is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-no-save-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md');
    const configBefore = readFileSync(path.join(cwd, 'agents.json'), 'utf8');
    const lockBefore = readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8');

    const result = await runCliSubprocess(
      ['--no-save', 'remove', 'agents-repo/sample-agent'],
      { cwd },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('(not saved)');
    expect(() => readFileSync(skillPath, 'utf8')).toThrow();
    expect(readFileSync(path.join(cwd, 'agents.json'), 'utf8')).toBe(configBefore);
    expect(readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toBe(lockBefore);
  });

  it('removes globally without touching project config or lock', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-home-'));
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-global-'));
    tempDirs.push(cwd);
    tempDirs.push(homeDir);

    writeInstallConfig(cwd, mockBaseUrl);
    const globalRoot = path.join(homeDir, '.agents-repo');
    mkdirSync(globalRoot, { recursive: true });
    writeFileSync(
      path.join(globalRoot, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: { 'agents-repo/sample-agent': '^1.0.0' },
      }),
      'utf8',
    );

    const env = { ...process.env, HOME: homeDir };

    await runCliSubprocess(['install', '-g', 'agents-repo/sample-agent'], { cwd, env });

    const globalSkill = path.join(globalRoot, '.cursor/skills/sample/SKILL.md');
    expect(readFileSync(globalSkill, 'utf8')).toContain('name: sample');

    const removeResult = await runCliSubprocess(
      ['remove', '-g', 'agents-repo/sample-agent'],
      { cwd, env },
    );
    expect(removeResult.status).toBe(0);
    expect(() => readFileSync(globalSkill, 'utf8')).toThrow();
    expect(() => readFileSync(path.join(cwd, 'agents-lock.json'), 'utf8')).toThrow();

    const globalLock = JSON.parse(
      readFileSync(path.join(globalRoot, 'agents-lock.json'), 'utf8'),
    ) as { packages: Record<string, unknown> };
    expect(globalLock.packages['agents-repo/sample-agent']).toBeUndefined();
  });

  it('exits 3 when package is not configured in agents.json', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-not-configured-'));
    tempDirs.push(cwd);
    writeFileSync(
      path.join(cwd, 'agents.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        registry: { url: mockBaseUrl, ref: 'v2.0.0' },
        targets: ['cursor'],
        packages: {},
      }),
      'utf8',
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
                integrity: `sha256-${sha256}`,
                artifact: '1.0.0-cursor.zip',
              },
            },
          },
        },
      }),
      'utf8',
    );

    const result = await runCliSubprocess(['remove', 'agents-repo/sample-agent'], { cwd });
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('not listed in agents.json packages');
  });

  it('keeps config when a modified file is skipped without --force', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-modified-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md');
    writeFileSync(skillPath, 'user edited this file', 'utf8');

    const result = await runCliSubprocess(['remove', 'agents-repo/sample-agent'], { cwd });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Skipped modified file');
    expect(readFileSync(skillPath, 'utf8')).toBe('user edited this file');

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      packages: Record<string, string>;
    };
    expect(config.packages['agents-repo/sample-agent']).toBe('^1.0.0');
  });

  it('removes modified files when --force is set', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-remove-force-'));
    tempDirs.push(cwd);
    writeInstallConfig(cwd, mockBaseUrl);

    await runCliSubprocess(['install', 'agents-repo/sample-agent'], { cwd });

    const skillPath = path.join(cwd, '.cursor/skills/sample/SKILL.md');
    writeFileSync(skillPath, 'user edited this file', 'utf8');

    const result = await runCliSubprocess(
      ['remove', '--force', 'agents-repo/sample-agent'],
      { cwd },
    );
    expect(result.status).toBe(0);
    expect(() => readFileSync(skillPath, 'utf8')).toThrow();

    const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
      packages: Record<string, string>;
    };
    expect(config.packages['agents-repo/sample-agent']).toBeUndefined();
  });
});
