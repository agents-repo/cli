import { CommanderError } from 'commander';

import { resetCliGlobals } from '../application/cliGlobals.js';
import { createCliProgram } from './createCliProgram.js';

const USAGE_EXIT_CODE = 2;

const isUsageCommanderError = (error: CommanderError): boolean => {
  return (
    error.code === 'commander.unknownOption' ||
    error.code === 'commander.unknownCommand' ||
    error.code === 'commander.excessArguments' ||
    error.code === 'commander.missingArgument' ||
    error.code === 'commander.invalidArgument'
  );
};

const isSuccessfulCommanderError = (error: CommanderError): boolean => {
  return (
    error.code === 'commander.help' ||
    error.code === 'commander.helpDisplayed' ||
    error.code === 'commander.version'
  );
};

export const runCli = async (argv: readonly string[]): Promise<void> => {
  resetCliGlobals();

  const program = createCliProgram();

  try {
    await program.parseAsync(argv);
    process.exit(0);
  } catch (error) {
    if (!(error instanceof CommanderError)) {
      throw error;
    }

    if (isSuccessfulCommanderError(error)) {
      process.exit(0);
    }

    if (isUsageCommanderError(error)) {
      process.exit(USAGE_EXIT_CODE);
    }

    process.exit(error.exitCode);
  }
};
