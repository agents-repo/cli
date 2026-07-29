import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRY_CONFIG } from '../../../src/modules/registry/infrastructure/registrySourceConfig.js';

const nodeExecutable = process.execPath;
const binPath = path.resolve(process.cwd(), 'dist/bin/agents-repo.js');

describe('add-target command subprocess', () => {
  it('appends targets to an existing agents.json', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'agents-add-target-cli-'));

    try {
      writeFileSync(
        path.join(cwd, 'agents.json'),
        JSON.stringify({
          schemaVersion: '1.0.0',
          registry: DEFAULT_REGISTRY_CONFIG,
          targets: ['cursor'],
          packages: {},
        }),
      );

      const result = spawnSync(nodeExecutable, [binPath, 'add-target', 'github-copilot'], {
        cwd,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Updated');
      const config = JSON.parse(readFileSync(path.join(cwd, 'agents.json'), 'utf8')) as {
        targets: string[];
      };
      expect(config.targets).toEqual(['github-copilot', 'cursor']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
