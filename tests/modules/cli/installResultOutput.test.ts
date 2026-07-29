import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InstallResult } from '../../../src/modules/install/domain/installResult.js';
import {
  INSTALL_RESULT_ACTION_LABELS,
  UPDATE_RESULT_ACTION_LABELS,
  formatMultiTargetInstallSummary,
  formatMultiTargetInstallSummaries,
  writeBulkInstallResultSuccess,
} from '../../../src/modules/cli/presentation/installResultOutput.js';

const makeResult = (overrides: Partial<InstallResult> = {}): InstallResult => ({
  packageId: 'agents-repo/sample-agent',
  version: '1.0.0',
  target: 'cursor',
  extractRoot: '/home/test/project',
  artifactUrl: 'https://example.test/1.0.0-cursor.zip',
  saved: true,
  dryRun: false,
  global: false,
  noSave: false,
  warnings: [],
  ...overrides,
});

describe('formatMultiTargetInstallSummary', () => {
  it('formats install labels with sorted target names', () => {
    const line = formatMultiTargetInstallSummary(
      [
        makeResult({ target: 'github-copilot' }),
        makeResult({ target: 'cursor' }),
      ],
      INSTALL_RESULT_ACTION_LABELS,
    );

    expect(line).toBe(
      'Installed agents-repo/sample-agent@1.0.0 to 2 targets: cursor, github-copilot',
    );
  });

  it('formats update dry-run labels', () => {
    const line = formatMultiTargetInstallSummary(
      [
        makeResult({ target: 'cursor', dryRun: true }),
        makeResult({ target: 'github-copilot', dryRun: true }),
      ],
      UPDATE_RESULT_ACTION_LABELS,
    );

    expect(line).toBe(
      'Would update agents-repo/sample-agent@1.0.0 to 2 targets: cursor, github-copilot',
    );
  });
});

describe('formatMultiTargetInstallSummaries', () => {
  it('emits one line per package in sorted package id order', () => {
    const lines = formatMultiTargetInstallSummaries(
      [
        makeResult({ packageId: 'agents-repo/zeta', target: 'cursor' }),
        makeResult({ packageId: 'agents-repo/zeta', target: 'github-copilot' }),
        makeResult({ packageId: 'agents-repo/alpha', target: 'cursor' }),
        makeResult({ packageId: 'agents-repo/alpha', target: 'github-copilot' }),
      ],
      INSTALL_RESULT_ACTION_LABELS,
    );

    expect(lines).toEqual([
      'Installed agents-repo/alpha@1.0.0 to 2 targets: cursor, github-copilot',
      'Installed agents-repo/zeta@1.0.0 to 2 targets: cursor, github-copilot',
    ]);
  });
});

describe('writeBulkInstallResultSuccess', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes per-target lines and summary when verbose and multiple targets', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const results = [
      makeResult({ target: 'github-copilot' }),
      makeResult({ target: 'cursor' }),
    ];

    writeBulkInstallResultSuccess(results, false, INSTALL_RESULT_ACTION_LABELS, true);

    const lines = write.mock.calls.map((call) => String(call[0]));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe(
      'Installed agents-repo/sample-agent@1.0.0 to 2 targets: cursor, github-copilot\n',
    );
  });

  it('skips summary for a single target even when verbose', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    writeBulkInstallResultSuccess([makeResult()], false, INSTALL_RESULT_ACTION_LABELS, true);

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('skips summary without verbose for multiple targets', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const results = [
      makeResult({ target: 'cursor' }),
      makeResult({ target: 'github-copilot' }),
    ];

    writeBulkInstallResultSuccess(results, false, INSTALL_RESULT_ACTION_LABELS, false);

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('does not write summary in json mode', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const results = [
      makeResult({ target: 'cursor' }),
      makeResult({ target: 'github-copilot' }),
    ];

    writeBulkInstallResultSuccess(results, true, INSTALL_RESULT_ACTION_LABELS, true);

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toContain('"packages"');
  });
});
