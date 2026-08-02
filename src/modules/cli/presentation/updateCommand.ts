import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { BulkInstallService } from '../../install/application/bulkInstallService.js';
import { handleCliError } from './cliErrorHandling.js';
import {
  UPDATE_RESULT_ACTION_LABELS,
  collectInstallResultWarnings,
  writeBulkInstallResultSuccess,
  writeInstallResultWarnings,
} from './installResultOutput.js';

export interface UpdateCommandOptions {
  readonly global?: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
}

export const registerUpdateCommand = (program: Command): void => {
  program
    .command('update [package-id]')
    .aliases(['up', 'upgrade'])
    .description('Update configured packages within semver ranges in agents.json')
    .option('-g, --global', 'Update packages in the global agents-repo home directory')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .option('--force', 'Overwrite files when content differs from the artifact at the same version')
    .action(async function updateAction(
      this: Command,
      packageId: string | undefined,
      options: UpdateCommandOptions,
    ) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      const runOptions = {
        global: options.global ?? false,
        yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
        force: options.force ?? false,
        dryRun: globals.dryRun,
        noSave: globals.noSave,
        preferOnline: globals.preferOnline,
        packageId,
        enforceConfiguredOnly: true,
      };

      try {
        const service = new BulkInstallService();
        const results = await service.runAll(runOptions);
        const warnings = collectInstallResultWarnings(results);
        writeInstallResultWarnings(warnings, globals.json);
        writeBulkInstallResultSuccess(
          results,
          globals.json,
          UPDATE_RESULT_ACTION_LABELS,
          globals.verbose,
        );
      } catch (error) {
        handleCliError(error);
      }
    });
};
