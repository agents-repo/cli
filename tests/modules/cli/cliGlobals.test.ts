import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCliGlobals, resetCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js';
import { createCliProgram } from '../../../src/modules/cli/presentation/createCliProgram.js';

const tempDirs: string[] = [];

const withConfigOverride = async (run: () => Promise<void>): Promise<void> => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-globals-'));
  tempDirs.push(tempDir);
  const configPath = path.join(tempDir, 'agents.json');
  const previousConfigOverride = process.env.AGENTS_REPO_CONFIG;

  process.env.AGENTS_REPO_CONFIG = configPath;
  try {
    await run();
  } finally {
    if (previousConfigOverride === undefined) {
      delete process.env.AGENTS_REPO_CONFIG;
    } else {
      process.env.AGENTS_REPO_CONFIG = previousConfigOverride;
    }
  }
};

describe('cli global options', () => {
  beforeEach(() => {
    resetCliGlobals();
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const tempDir of tempDirs.splice(0)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('sets json and verbose globals from root options before subcommand actions', async () => {
    await withConfigOverride(async () => {
      const program = createCliProgram();

      await program.parseAsync(['--json', '--verbose', 'init', '--target', 'cursor'], {
        from: 'user',
      });

      expect(getCliGlobals()).toEqual({
        json: true,
        verbose: true,
        yes: false,
      });
    });
  });

  it('sets yes global from root options before subcommand actions', async () => {
    await withConfigOverride(async () => {
      const program = createCliProgram();

      await program.parseAsync(['-y', 'init', '--target', 'cursor'], { from: 'user' });

      expect(getCliGlobals()).toEqual({
        json: false,
        verbose: false,
        yes: true,
      });
    });
  });

  it('keeps globals false when options are not provided', async () => {
    await withConfigOverride(async () => {
      const program = createCliProgram();

      await program.parseAsync(['init', '--target', 'cursor'], { from: 'user' });

      expect(getCliGlobals()).toEqual({
        json: false,
        verbose: false,
        yes: false,
      });
    });
  });
});
