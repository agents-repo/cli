import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import { InitService } from '../../config/application/initService.js';
import type { InitResult } from '../../config/domain/initResult.js';
import { handleCliError } from './cliErrorHandling.js';

export interface InitCommandOptions {
  readonly force?: boolean;
  readonly target?: string[];
  readonly targets?: string[];
  readonly yes?: boolean;
}

const formatInitSuccess = (result: InitResult): string => {
  const targetLabel =
    result.targets === undefined || result.targets.length === 0
      ? '(unchanged)'
      : result.targets.join(', ');
  const action = result.created ? 'Created' : 'Updated';
  const warningSuffix =
    result.warnings.length > 0 ? `, ${result.warnings.length} warning(s)` : '';
  return `${action} ${result.configPath} (gate: ${result.gateMode}, targets: ${targetLabel}${warningSuffix})`;
};

const writeInitWarnings = (warnings: InitResult['warnings']): void => {
  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning.message}\n`);
  }
};

const mergeCliTargetIds = (options: InitCommandOptions): string[] | undefined => {
  const fromTargets = options.targets ?? [];
  const fromTarget = options.target ?? [];
  const merged = [...fromTargets, ...fromTarget];
  return merged.length === 0 ? undefined : merged;
};

export const registerInitCommand = (program: Command): void => {
  program
    .command('init')
    .description('Initialize agents.json in the current project')
    .option('--force', 'Overwrite agents-repo-managed keys in the active schema gate target')
    .option('--targets <ids...>', 'Set one or more install target ids')
    .option('--target <ids...>', 'Alias for --targets on init')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function initAction(this: Command, options: InitCommandOptions) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      try {
        const service = new InitService();
        const result = await service.run({
          force: options.force ?? false,
          targetIds: mergeCliTargetIds(options),
          yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
          verbose: globals.verbose,
        });

        writeInitWarnings(result.warnings);
        process.stdout.write(`${formatInitSuccess(result)}\n`);
      } catch (error) {
        handleCliError(error);
      }
    });
};
