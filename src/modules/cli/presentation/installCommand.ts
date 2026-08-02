import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { BulkInstallService } from '../../install/application/bulkInstallService.js';
import { InstallService } from '../../install/application/installService.js';
import { handleCliError } from './cliErrorHandling.js';
import {
  INSTALL_RESULT_ACTION_LABELS,
  collectInstallResultWarnings,
  writeBulkInstallResultSuccess,
  writeInstallResultWarnings,
} from './installResultOutput.js';

export interface InstallCommandOptions {
  readonly global?: boolean;
  readonly yes?: boolean;
}

export const registerInstallCommand = (program: Command): void => {
  program
    .command('install [package-id...]')
    .alias('i')
    .description('Install packages from the registry')
    .option('-g, --global', 'Install using the global agents-repo home directory')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function installAction(
      this: Command,
      packageIds: string[],
      options: InstallCommandOptions,
    ) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      const runOptions = {
        global: options.global ?? false,
        yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
        dryRun: globals.dryRun,
        noSave: globals.noSave,
      };

      try {
        if (packageIds.length === 0) {
          const service = new BulkInstallService();
          const results = await service.runAll(runOptions);
          const warnings = collectInstallResultWarnings(results);
          writeInstallResultWarnings(warnings, globals.json);
          writeBulkInstallResultSuccess(
            results,
            globals.json,
            INSTALL_RESULT_ACTION_LABELS,
            globals.verbose,
          );
          return;
        }

        const service = new InstallService();
        const results = await service.run({
          packageIds,
          ...runOptions,
        });

        const warnings = collectInstallResultWarnings(results);
        writeInstallResultWarnings(warnings, globals.json);
        writeBulkInstallResultSuccess(
          results,
          globals.json,
          INSTALL_RESULT_ACTION_LABELS,
          globals.verbose,
        );
      } catch (error) {
        handleCliError(error);
      }
    });
};
