import type { Command } from 'commander';

import {
  ListInstalledService,
  type ListInstalledResult,
  type ListedPackage,
} from '../../config/application/listInstalledService.js';
import { getCliGlobals } from '../application/cliGlobals.js';
import { handleCliError } from './cliErrorHandling.js';

export interface ListCommandOptions {
  readonly global?: boolean;
}

const writeListWarnings = (warnings: readonly string[], json: boolean): void => {
  if (json) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

const writeListTextResults = (packages: readonly ListedPackage[]): void => {
  if (packages.length === 0) {
    process.stdout.write('No installed packages found.\n');
    return;
  }

  for (const pkg of packages) {
    process.stdout.write(`${pkg.id}@${pkg.version}  target=${pkg.target}\n`);
  }
};

const packageToJsonFields = (pkg: ListedPackage): Record<string, unknown> => ({
  id: pkg.id,
  version: pkg.version,
  target: pkg.target,
  integrity: pkg.integrity,
  artifact: pkg.artifact,
  ...(pkg.range === undefined ? {} : { range: pkg.range }),
});

const writeListJsonResults = (result: ListInstalledResult): void => {
  process.stdout.write(
    `${JSON.stringify({
      scope: result.scope,
      rootPath: result.rootPath,
      ...(result.resolvedRef === undefined ? {} : { resolvedRef: result.resolvedRef }),
      warnings: result.warnings,
      packages: result.packages.map((pkg) => packageToJsonFields(pkg)),
    })}\n`,
  );
};

export const registerListCommand = (program: Command): void => {
  program
    .command('list')
    .alias('ls')
    .description('List installed packages')
    .option('-g, --global', 'List globally installed packages')
    .action(async function listAction(this: Command, options: ListCommandOptions) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      try {
        const service = new ListInstalledService();
        const result = await service.run({
          global: options.global,
          yes: rootOpts.yes ?? globals.yes ?? false,
        });

        writeListWarnings(result.warnings, globals.json);

        if (globals.json) {
          writeListJsonResults(result);
          return;
        }

        writeListTextResults(result.packages);
      } catch (error) {
        handleCliError(error);
      }
    });
};
