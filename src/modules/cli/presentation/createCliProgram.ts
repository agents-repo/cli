import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError } from 'commander';

import { setCliGlobals } from '../application/cliGlobals.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const readPackageVersion = (): string => {
  const { version } = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    version: string;
  };

  return version;
};

const registerPlaceholderCommand = (
  program: Command,
  name: string,
  description: string,
  issueNumber: number,
  aliases: string[] = [],
): void => {
  const command = program
    .command(name)
    .description(description)
    .allowUnknownOption()
    .allowExcessArguments()
    .action(() => {
      console.error(`${name} is not implemented yet (see issue #${issueNumber})`);
      process.exit(1);
    });

  for (const alias of aliases) {
    command.alias(alias);
  }
};

const syncGlobalsFromCommand = (command: Command): void => {
  const { json = false, verbose = false } = command.optsWithGlobals<{
    json?: boolean;
    verbose?: boolean;
  }>();

  setCliGlobals({ json, verbose });
};

export const createCliProgram = (): Command => {
  const program = new Command();

  program
    .name('agents-repo')
    .description('Official CLI for installing and managing agents-repo packages.')
    .version(readPackageVersion(), '-V, --version', 'Show CLI version')
    .option('--json', 'Machine-readable output')
    .option('--verbose', 'Detailed logging')
    .showHelpAfterError()
    .hook('preAction', (thisCommand) => {
      syncGlobalsFromCommand(thisCommand);
    });

  registerPlaceholderCommand(program, 'init', 'Initialize agents.json in the current project', 7);
  registerPlaceholderCommand(program, 'install', 'Install packages from the registry', 8, ['i']);
  registerPlaceholderCommand(program, 'search', 'Search the registry catalog', 10, ['find']);
  registerPlaceholderCommand(program, 'list', 'List installed packages', 11, ['ls']);

  return program;
};

export const isCommanderUsageError = (error: unknown): error is CommanderError => {
  return error instanceof CommanderError && error.code === 'commander.unknownOption';
};
