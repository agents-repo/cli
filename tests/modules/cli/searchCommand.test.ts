import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isCancel } from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js';
import { createCliProgram } from '../../../src/modules/cli/presentation/createCliProgram.js';
import { pickPackageInteractively, type InteractivePackagePickerDeps } from '../../../src/modules/cli/presentation/searchCommand.js';
import { sampleRegistryCatalog } from '../../fixtures/sampleRegistryCatalog.js';

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
}));

vi.mock('../../../src/modules/registry/application/searchCatalogService.js', () => ({
  SearchCatalogService: class {
    run = runMock;
  },
}));

describe('search command', () => {
  const tempDirs: string[] = [];
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetCliGlobals();
    runMock.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const withConfigOverride = async (run: () => Promise<void>): Promise<void> => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'agents-cli-search-'));
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

  it('prints text results for a search query', async () => {
    runMock.mockResolvedValue({
      query: 'sample',
      packages: sampleRegistryCatalog.packages,
      indexUrl: 'https://example.test/index.json',
      updatedAt: sampleRegistryCatalog.updatedAt,
      warnings: [],
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await withConfigOverride(async () => {
      const program = createCliProgram();
      await program.parseAsync(['search', 'sample'], { from: 'user' });
    });

    expect(runMock).toHaveBeenCalledWith({ query: 'sample', yes: false });
    expect(stdoutSpy.mock.calls.map((call) => String(call[0])).join('')).toContain(
      'agents-repo/sample-agent@1.0.0',
    );
  });

  it('emits JSON with packages array when --json is set', async () => {
    runMock.mockResolvedValue({
      query: 'cursor',
      packages: sampleRegistryCatalog.packages,
      indexUrl: 'https://example.test/index.json',
      updatedAt: sampleRegistryCatalog.updatedAt,
      warnings: ['deprecated schema'],
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await withConfigOverride(async () => {
      const program = createCliProgram();
      await program.parseAsync(['--json', 'find', 'cursor'], { from: 'user' });
    });

    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    const parsed = JSON.parse(output.trim()) as {
      query: string;
      packages: { id: string }[];
      warnings: string[];
    };

    expect(parsed.query).toBe('cursor');
    expect(parsed.packages).toHaveLength(1);
    expect(parsed.packages[0]?.id).toBe('agents-repo/sample-agent');
    expect(parsed.warnings).toEqual(['deprecated schema']);
  });

  it('exits 2 when --interactive is used without a TTY', async () => {
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await withConfigOverride(async () => {
        const program = createCliProgram();
        await program.parseAsync(['search', '--interactive'], { from: 'user' });
      });

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(stderrSpy.mock.calls.map((call) => String(call[0])).join('')).toContain(
        'interactive terminal',
      );
      expect(runMock).not.toHaveBeenCalled();
    } finally {
      if (stdinDescriptor) {
        Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
      }
      if (stdoutDescriptor) {
        Object.defineProperty(process.stdout, 'isTTY', stdoutDescriptor);
      }
    }
  });
});

describe('pickPackageInteractively', () => {
  it('returns the selected package id', async () => {
    const autocomplete = vi.fn().mockResolvedValue('agents-repo/sample-agent');
    const selected = await pickPackageInteractively(sampleRegistryCatalog.packages, {
      deps: {
        autocomplete,
        isCancel,
        cancel: vi.fn(),
      },
    });

    expect(selected).toBe('agents-repo/sample-agent');
    expect(autocomplete).toHaveBeenCalledWith(
      expect.objectContaining({ output: undefined }),
    );
  });

  it('routes clack prompts to stderr when jsonStdout is set', async () => {
    const autocomplete = vi.fn().mockResolvedValue('agents-repo/sample-agent');
    await pickPackageInteractively(sampleRegistryCatalog.packages, {
      jsonStdout: true,
      deps: {
        autocomplete,
        isCancel,
        cancel: vi.fn(),
      },
    });

    expect(autocomplete).toHaveBeenCalledWith(
      expect.objectContaining({ output: process.stderr }),
    );
  });

  it('returns null when the prompt is cancelled', async () => {
    const cancel = vi.fn();
    const isCancelStub = vi
      .fn()
      .mockReturnValue(true) as unknown as InteractivePackagePickerDeps['isCancel'];
    const selected = await pickPackageInteractively(sampleRegistryCatalog.packages, {
      deps: {
        autocomplete: vi.fn().mockResolvedValue('ignored'),
        isCancel: isCancelStub,
        cancel,
      },
    });

    expect(selected).toBeNull();
    expect(cancel).toHaveBeenCalledWith('Search cancelled.', undefined);
  });
});
