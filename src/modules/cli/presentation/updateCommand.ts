import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { BulkInstallService } from '../../install/application/bulkInstallService.js';
import type { InstallResult } from '../../install/domain/installResult.js';
import { handleCliError } from './cliErrorHandling.js';

export interface UpdateCommandOptions {
  readonly global?: boolean;
  readonly target?: string;
  readonly yes?: boolean;
}

const formatUpdateSuccess = (result: InstallResult): string => {
  const action = result.dryRun ? 'Would update' : 'Updated';
  let saveSuffix = '';
  if (!result.saved && !result.dryRun && result.noSave) {
    saveSuffix = ' (not saved)';
  }
  return `${action} ${result.packageId}@${result.version} for target ${result.target} into ${result.extractRoot}${saveSuffix}`;
};

const installResultToJson = (result: InstallResult): Record<string, unknown> => ({
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
});

const writeUpdateWarnings = (warnings: InstallResult['warnings'], json: boolean): void => {
  if (json) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

const writeBulkUpdateSuccess = (results: readonly InstallResult[], json: boolean): void => {
  if (json) {
    const warnings = collectWarnings(results);
    const packages = results.map((result) => ({
      ...installResultToJson(result),
      warnings: [],
    }));
    process.stdout.write(`${JSON.stringify({ warnings, packages })}\n`);
    return;
  }

  for (const result of results) {
    process.stdout.write(`${formatUpdateSuccess(result)}\n`);
  }
};

const collectWarnings = (results: readonly InstallResult[]): InstallResult['warnings'] => {
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const result of results) {
    for (const warning of result.warnings) {
      if (!seen.has(warning)) {
        seen.add(warning);
        warnings.push(warning);
      }
    }
  }

  return warnings;
};

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
        const warnings = collectWarnings(results);
        writeUpdateWarnings(warnings, globals.json);
        writeBulkUpdateSuccess(results, globals.json);
      } catch (error) {
        handleCliError(error);
      }
    });
};
