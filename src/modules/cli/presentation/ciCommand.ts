import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { CiInstallService } from '../../install/application/ciInstallService.js';
import { handleCliError } from './cliErrorHandling.js';
import {
  CI_RESULT_ACTION_LABELS,
  collectInstallResultWarnings,
  writeCiInstallResultSuccess,
  writeInstallResultWarnings,
} from './installResultOutput.js';

export interface CiCommandOptions {
  readonly force?: boolean;
  readonly yes?: boolean;
}

export const registerCiCommand = (program: Command): void => {
  program
    .command('ci')
    .description('Install exactly from agents-lock.json (frozen lockfile install)')
    .option('--force', 'Allow lock version outside resolved agents.json semver range')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function ciAction(this: Command, options: CiCommandOptions) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      try {
        const service = new CiInstallService();
        const results = await service.run({
          yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
          dryRun: globals.dryRun,
          force: options.force ?? false,
        });

        const warnings = collectInstallResultWarnings(results);
        writeInstallResultWarnings(warnings, globals.json);
        writeCiInstallResultSuccess(
          results,
          globals.json,
          CI_RESULT_ACTION_LABELS,
          globals.verbose,
        );
      } catch (error) {
        handleCliError(error);
      }
    });
};
