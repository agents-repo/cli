import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCliGlobals, resetCliGlobals } from '../../../src/modules/cli/application/cliGlobals.js';
import { createCliProgram } from '../../../src/modules/cli/presentation/createCliProgram.js';

describe('cli global options', () => {
  beforeEach(() => {
    resetCliGlobals();
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit);
  });

  it('sets json and verbose globals from root options before subcommand actions', () => {
    const program = createCliProgram();

    program.parse(['--json', '--verbose', 'init'], { from: 'user' });

    expect(getCliGlobals()).toEqual({
      json: true,
      verbose: true,
    });
  });

  it('keeps globals false when options are not provided', () => {
    const program = createCliProgram();

    program.parse(['init'], { from: 'user' });

    expect(getCliGlobals()).toEqual({
      json: false,
      verbose: false,
    });
  });
});
