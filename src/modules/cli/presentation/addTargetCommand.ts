import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { AddTargetService } from '../../config/application/addTargetService.js';
import { handleCliError } from './cliErrorHandling.js';

export interface AddTargetCommandOptions {
  readonly yes?: boolean;
}

export const registerAddTargetCommand = (program: Command): void => {
  program
    .command('add-target <ids...>')
    .description('Append install target ids to agents.json targets[]')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function addTargetAction(
      this: Command,
      ids: string[],
      options: AddTargetCommandOptions,
    ) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      try {
        const service = new AddTargetService();
        const result = await service.run({
          targetIds: ids,
          yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
        });

        for (const warning of result.warnings) {
          process.stderr.write(`warning: ${warning}\n`);
        }

        if (globals.json) {
          process.stdout.write(
            `${JSON.stringify({
              configPath: result.configPath,
              targets: result.targets,
              changed: result.changed,
              warnings: result.warnings,
            })}\n`,
          )
          return
        }

        if (result.changed) {
          process.stdout.write(
            `Updated ${result.configPath} (targets: ${result.targets.join(', ')})\n`,
          )
        } else {
          process.stdout.write(`No changes to ${result.configPath}\n`)
        }
      } catch (error) {
        handleCliError(error);
      }
    });
};
