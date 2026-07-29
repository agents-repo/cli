import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { RemoveService } from '../../install/application/removeService.js';
import { handleCliError } from './cliErrorHandling.js';
import {
  REMOVE_RESULT_ACTION_LABELS,
  collectRemoveResultWarnings,
  writeBulkRemoveResultSuccess,
  writeRemoveResultWarnings,
} from './removeResultOutput.js';

export interface RemoveCommandOptions {
  readonly global?: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
}

export const registerRemoveCommand = (program: Command): void => {
  program
    .command('remove <package-id>')
    .alias('rm')
    .description('Remove an installed package and its extracted files')
    .option('-g, --global', 'Remove from the global agents-repo home directory')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .option('--force', 'Delete files even when modified since install')
    .action(async function removeAction(
      this: Command,
      packageId: string,
      options: RemoveCommandOptions,
    ) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      const runOptions = {
        global: options.global ?? false,
        yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
        dryRun: globals.dryRun,
        noSave: globals.noSave,
        force: options.force ?? false,
        packageId,
      };

      try {
        const service = new RemoveService();
        const results = await service.run(runOptions);
        const warnings = collectRemoveResultWarnings(results);
        writeRemoveResultWarnings(warnings, globals.json);
        writeBulkRemoveResultSuccess(results, globals.json, REMOVE_RESULT_ACTION_LABELS);
      } catch (error) {
        handleCliError(error);
      }
    });
};
