import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { InstallService } from '../../install/application/installService.js';
import type { InstallResult } from '../../install/domain/installResult.js';
import { handleCliError } from './cliErrorHandling.js';

export interface InstallCommandOptions {
  readonly global?: boolean;
  readonly target?: string;
  readonly yes?: boolean;
}

const formatInstallSuccess = (result: InstallResult): string => {
  const action = result.dryRun ? 'Would install' : 'Installed';
  let saveSuffix = '';
  if (!result.saved && !result.dryRun && result.noSave) {
    saveSuffix = ' (not saved)';
  }
  return `${action} ${result.packageId}@${result.version} for target ${result.target} into ${result.extractRoot}${saveSuffix}`;
};

const writeInstallWarnings = (warnings: InstallResult['warnings'], json: boolean): void => {
  if (json) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

const writeInstallSuccess = (result: InstallResult, json: boolean): void => {
  if (json) {
    process.stdout.write(
      `${JSON.stringify({
        packageId: result.packageId,
        version: result.version,
        target: result.target,
        extractRoot: result.extractRoot,
        artifactUrl: result.artifactUrl,
        saved: result.saved,
        dryRun: result.dryRun,
        global: result.global,
        noSave: result.noSave,
        warnings: result.warnings,
      })}\n`,
    );
    return;
  }

  process.stdout.write(`${formatInstallSuccess(result)}\n`);
};

export const registerInstallCommand = (program: Command): void => {
  program
    .command('install <package-id>')
    .alias('i')
    .description('Install a package from the registry')
    .option('-g, --global', 'Install to global directory without updating project config')
    .option('--target <id>', 'Override install target for this invocation')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function installAction(this: Command, packageId: string, options: InstallCommandOptions) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      try {
        const service = new InstallService();
        const result = await service.run({
          packageId,
          target: options.target,
          global: options.global ?? false,
          yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
          dryRun: globals.dryRun,
          noSave: globals.noSave,
        });

        writeInstallWarnings(result.warnings, globals.json);
        writeInstallSuccess(result, globals.json);
      } catch (error) {
        handleCliError(error);
      }
    });
};
