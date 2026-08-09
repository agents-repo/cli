import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

import { setCliGlobals } from '../application/cliGlobals.js';
import { registerAddTargetCommand } from './addTargetCommand.js';
import { registerCiCommand } from './ciCommand.js';
import { registerDoctorCommand } from './doctorCommand.js';
import { registerInitCommand } from './initCommand.js';
import { registerInstallCommand } from './installCommand.js';
import { registerListCommand } from './listCommand.js';
import { registerRemoveCommand } from './removeCommand.js';
import { registerUpdateCommand } from './updateCommand.js';
import { registerSearchCommand } from './searchCommand.js';
import { registerSuggestAgentsCommand } from './suggestAgentsCommand.js';
import { registerTargetsCommand } from './targetsCommand.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const readPackageVersion = (): string => {
  const { version } = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    version: string;
  };

  return version;
};

const syncGlobalsFromCommand = (command: Command): void => {
  const {
    json = false,
    verbose = false,
    yes = false,
    dryRun = false,
    save,
    preferOnline = false,
  } = command.optsWithGlobals<{
    json?: boolean;
    verbose?: boolean;
    yes?: boolean;
    dryRun?: boolean;
    save?: boolean;
    preferOnline?: boolean;
  }>();

  setCliGlobals({ json, verbose, yes, dryRun, noSave: save === false, preferOnline });
};

export const createCliProgram = (): Command => {
  const program = new Command();

  program
    .name('agents-repo')
    .description('Official CLI for installing and managing agents-repo packages.')
    .version(readPackageVersion(), '-V, --version', 'Show CLI version')
    .option('--json', 'Machine-readable output')
    .option('--verbose', 'Detailed logging')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .option(
      '--dry-run',
      'Preview without saving: install skips download; remove downloads locked ZIPs to list paths that would be deleted',
    )
    .option('--no-save', 'Skip agents.json and lock writes')
    .option(
      '--prefer-online',
      'Fetch registry artifacts from the network instead of the local artifact cache',
    )
    .showHelpAfterError()
    .hook('preAction', (thisCommand) => {
      syncGlobalsFromCommand(thisCommand);
    })
    .exitOverride();

  registerInitCommand(program);
  registerAddTargetCommand(program);
  registerInstallCommand(program);
  registerCiCommand(program);
  registerDoctorCommand(program);
  registerUpdateCommand(program);
  registerSearchCommand(program);
  registerSuggestAgentsCommand(program);
  registerListCommand(program);
  registerRemoveCommand(program);
  registerTargetsCommand(program);

  return program;
};
