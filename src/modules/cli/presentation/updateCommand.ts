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
  readonly target?: string;
  readonly yes?: boolean;
}

export const registerUpdateCommand = (program: Command): void => {
  program
    .command('update [package-id]')
    .alias('up')
    .description('Update configured packages within semver ranges in agents.json')
    .option('-g, --global', 'Update global installs without updating project lock')
    .option('--target <id>', 'Override install target for this invocation')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function updateAction(
      this: Command,
      packageId: string | undefined,
      options: UpdateCommandOptions,
    ) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      const runOptions = {
        target: options.target,
        global: options.global ?? false,
        yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
        dryRun: globals.dryRun,
        noSave: globals.noSave,
        packageId,
        enforceConfiguredOnly: true,
      };

      try {
        const service = new BulkInstallService();
        const results = await service.runAll(runOptions);
        const warnings = collectInstallResultWarnings(results);
        writeInstallResultWarnings(warnings, globals.json);
        writeBulkInstallResultSuccess(results, globals.json, UPDATE_RESULT_ACTION_LABELS);
      } catch (error) {
        handleCliError(error);
      }
    });
};
