import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCliGlobals, resetCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js';
import { createCliProgram } from '../../../src/modules/cli/presentation/createCliProgram.js';

const tempDirs: string[] = [];

const withTempProjectDir = async (run: () => Promise<void>): Promise<void> => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-globals-'));
  tempDirs.push(tempDir);
  const originalCwd = process.cwd();

  process.chdir(tempDir);
  try {
    await run();
  } finally {
    process.chdir(originalCwd);
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
    await withTempProjectDir(async () => {
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
    const program = createCliProgram();

    await program.parseAsync(['-y', 'install'], { from: 'user' });

    expect(getCliGlobals()).toEqual({
      json: false,
      verbose: false,
      yes: true,
    });
  });

  it('keeps globals false when options are not provided', async () => {
    await withTempProjectDir(async () => {
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
