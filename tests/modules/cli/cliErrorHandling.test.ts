import { describe, expect, it, vi } from 'vitest';

import { getCliExitCode, writeCliError } from '../../../src/modules/cli/presentation/cliErrorHandling.js';
import { ConfigValidationError, LockValidationError } from '../../../src/modules/config/domain/configErrors.js';
import { NoMatchingVersionError, RegistryFetchError } from '../../../src/modules/registry/domain/errors.js';
import { setCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js';

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

  it('writes nothing for null or undefined throwables', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeCliError(null);
    writeCliError(undefined);

    expect(stderr).not.toHaveBeenCalled();
    stderr.mockRestore();
  });

  it('maps config validation errors to exit code 3', () => {
    const error = new ConfigValidationError('invalid target', 'invalid_enum');

    expect(getCliExitCode(error)).toBe(3);
  });

  it('maps lock validation errors to exit code 3 through ConfigError', () => {
    const error = new LockValidationError('invalid lock file');

    expect(getCliExitCode(error)).toBe(3);
  });

  it('maps unknown throwables to exit code 1', () => {
    expect(getCliExitCode('boom')).toBe(1);
  });

  it('maps registry fetch errors to exit code 1', () => {
    const error = new RegistryFetchError('Registry request failed with status 503', 503);

    expect(getCliExitCode(error)).toBe(1);
  });

  it('maps other registry errors to exit code 3', () => {
    expect(getCliExitCode(new NoMatchingVersionError('agents-repo/demo', '^9.0.0'))).toBe(3);
  });

  it('writes stable registry error codes in json mode', () => {
    setCliGlobals({ json: true, verbose: false, yes: false, dryRun: false, noSave: false });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeCliError(new NoMatchingVersionError('agents-repo/demo', '^9.0.0'));

    expect(stderr).toHaveBeenCalledWith(
      `${JSON.stringify({
        error: {
          code: 'no_matching_version',
          message: 'No manifest version satisfies range "^9.0.0" for agents-repo/demo',
        },
      })}\n`,
    );

    stderr.mockRestore();
  });

  it('writes stable registry fetch error codes in json mode', () => {
    setCliGlobals({ json: true, verbose: false, yes: false, dryRun: false, noSave: false });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeCliError(new RegistryFetchError('Registry request failed with status 503', 503));

    expect(stderr).toHaveBeenCalledWith(
      `${JSON.stringify({
        error: {
          code: 'registry_fetch_error',
          message: 'Registry request failed with status 503',
        },
      })}\n`,
    );

    stderr.mockRestore();
  });

  it('prefixes registry fetch errors with stable codes in text mode', () => {
    setCliGlobals({ json: false, verbose: false, yes: false, dryRun: false, noSave: false });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeCliError(new RegistryFetchError('Registry request failed with status 503', 503));

    expect(stderr).toHaveBeenCalledWith('[registry_fetch_error] Registry request failed with status 503\n');

    stderr.mockRestore();
  });
});
