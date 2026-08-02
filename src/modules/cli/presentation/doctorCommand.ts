import type { Command } from 'commander';

import {
  DoctorService,
  type DoctorCheck,
  type DoctorResult,
} from '../../config/application/doctorService.js';
import { getCliGlobals } from '../application/cliGlobals.js';

export interface DoctorCommandOptions {
  readonly yes?: boolean;
}

const writeDoctorWarnings = (warnings: readonly string[], json: boolean): void => {
  if (json) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

const checkStatusPrefix = (status: DoctorCheck['status']): string => {
  if (status === 'pass') {
    return 'ok';
  }

  if (status === 'fail') {
    return 'fail';
  }

  return 'skip';
};

const formatCheckLine = (check: DoctorCheck): string => {
  const prefix = checkStatusPrefix(check.status);
  const codeSuffix = check.code === undefined ? '' : ` [${check.code}]`;
  return `${prefix} ${check.id}: ${check.message}${codeSuffix}`;
};

const writeDoctorTextResults = (result: DoctorResult): void => {
  for (const check of result.checks) {
    process.stdout.write(`${formatCheckLine(check)}\n`);
  }
};

const writeDoctorJsonResults = (result: DoctorResult): void => {
  process.stdout.write(
    `${JSON.stringify({
      command: 'doctor',
      checks: result.checks.map((check) => ({
        id: check.id,
        status: check.status,
        message: check.message,
        ...(check.code === undefined ? {} : { code: check.code }),
      })),
      warnings: result.warnings,
    })}\n`,
  );
};

export const registerDoctorCommand = (program: Command): void => {
  program
    .command('doctor')
    .description('Validate project agents setup (read-only diagnostics)')
    .option('-y, --yes', 'Waive dual-definition mismatches with warnings')
    .action(async function doctorAction(this: Command, options: DoctorCommandOptions) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();

      const service = new DoctorService();
      const result = await service.run({
        yes: options.yes ?? rootOpts.yes ?? globals.yes ?? false,
      });

      writeDoctorWarnings(result.warnings, globals.json);

      if (globals.json) {
        writeDoctorJsonResults(result);
      } else {
        writeDoctorTextResults(result);
      }

      process.exit(result.exitCode);
    });
};
