import { CommanderError } from 'commander';

import { resetCliGlobals } from '../application/cliGlobals.js';
import { createCliProgram, isCommanderUsageError } from './createCliProgram.js';

const USAGE_EXIT_CODE = 2;

const isRootHelpRequest = (argv: readonly string[]): boolean => {
  return argv.slice(2).some((arg) => arg === '--help' || arg === '-h');
};

const isRootVersionRequest = (argv: readonly string[]): boolean => {
  return argv.slice(2).some((arg) => arg === '--version' || arg === '-V');
};

const hasSubcommand = (argv: readonly string[]): boolean => {
  const args = argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--') {
      return args.slice(index + 1).some((value) => !value.startsWith('-'));
    }

    if (arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V') {
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    return true;
  }

  return false;
};

export const runCli = (argv: readonly string[]): void => {
  resetCliGlobals();

  const program = createCliProgram();

  if (isRootVersionRequest(argv) || isRootHelpRequest(argv)) {
    program.parse(argv);
    return;
  }

  if (!hasSubcommand(argv)) {
    program.outputHelp();
    process.exit(0);
  }

  try {
    program.parse(argv);
  } catch (error) {
    if (isCommanderUsageError(error)) {
      process.exit(USAGE_EXIT_CODE);
    }

    if (error instanceof CommanderError) {
      process.exit(error.exitCode);
    }

    throw error;
  }
};
