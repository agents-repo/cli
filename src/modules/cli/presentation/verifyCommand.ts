import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { VerifyInstallService } from '../../install/application/verifyInstallService.js';
import { handleCliError } from './cliErrorHandling.js';

export interface VerifyCommandOptions {
  readonly yes?: boolean;
  readonly online?: boolean;
}

export const registerVerifyCommand = (program: Command): void => {
  program
    .command('verify')
    .description('Validate agents-lock.json and on-disk install surfaces without downloading ZIPs')
    .option('--online', 'Also verify registry catalog index reachability')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function verifyAction(this: Command, options: VerifyCommandOptions) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      try {
        const service = new VerifyInstallService();
        const result = await service.run({
          yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
          online: options.online === true,
        });

        if (globals.json) {
          process.stdout.write(
            `${JSON.stringify({
              command: 'verify',
              warnings: result.warnings,
            })}\n`,
          );
        } else {
          for (const warning of result.warnings) {
            process.stderr.write(`warning: ${warning}\n`);
          }
          process.stdout.write('verify: lock and install surfaces OK\n');
        }
      } catch (error) {
        handleCliError(error);
      }
    });
};
