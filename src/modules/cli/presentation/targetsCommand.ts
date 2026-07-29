import type { Command } from 'commander';

import {
  ShowResolvedTargetsService,
  type ShowResolvedTargetsResult,
} from '../../config/application/showResolvedTargetsService.js';
import { getCliGlobals } from '../application/cliGlobals.js';
import { handleCliError } from './cliErrorHandling.js';

export interface TargetsCommandOptions {
  readonly global?: boolean;
}

const writeTargetsWarnings = (warnings: readonly string[], json: boolean): void => {
  if (json) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

const writeTargetsTextResults = (result: ShowResolvedTargetsResult): void => {
  if (result.targets.length === 0) {
    process.stdout.write('No install targets configured.\n');
    return;
  }

  for (const target of result.targets) {
    process.stdout.write(`${target}\n`);
  }
};

const writeTargetsJsonResults = (result: ShowResolvedTargetsResult): void => {
  process.stdout.write(
    `${JSON.stringify({
      scope: result.scope,
      rootPath: result.rootPath,
      gateMode: result.gateMode,
      warnings: result.warnings,
      targets: result.targets,
    })}\n`,
  );
};

export const registerTargetsCommand = (program: Command): void => {
  program
    .command('targets')
    .description('Show resolved install targets from agents.json')
    .option('-g, --global', 'Read targets from global agents.json')
    .action(async function targetsAction(this: Command, options: TargetsCommandOptions) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      try {
        const service = new ShowResolvedTargetsService();
        const result = await service.run({
          global: options.global,
          yes: rootOpts.yes ?? globals.yes ?? false,
        });

        writeTargetsWarnings(result.warnings, globals.json);

        if (globals.json) {
          writeTargetsJsonResults(result);
          return;
        }

        writeTargetsTextResults(result);
      } catch (error) {
        handleCliError(error);
      }
    });
};
