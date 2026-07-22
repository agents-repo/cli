import { describe, expect, it, vi } from 'vitest';

import { getCliExitCode, writeCliError } from '../../../src/modules/cli/presentation/cliErrorHandling.js';
import { ConfigValidationError } from '../../../src/modules/config/domain/configErrors.js';

describe('cliErrorHandling', () => {
  it('writes a fallback message for non-Error throwables', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeCliError('config file is unreadable');

    expect(stderr).toHaveBeenCalledWith('config file is unreadable\n');
    stderr.mockRestore();
  });

  it('writes a deterministic fallback for non-serializable throwables', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeCliError(() => undefined);

    expect(stderr).toHaveBeenCalledWith('Unknown error\n');
    stderr.mockRestore();
  });

  it('maps config validation errors to exit code 3', () => {
    const error = new ConfigValidationError('invalid target', 'invalid_enum');

    expect(getCliExitCode(error)).toBe(3);
  });

  it('maps unknown throwables to exit code 1', () => {
    expect(getCliExitCode('boom')).toBe(1);
  });
});
