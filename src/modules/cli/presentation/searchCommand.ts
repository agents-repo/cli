import * as clack from '@clack/prompts';
import type { Command } from 'commander';

import { getCliGlobals } from '../application/cliGlobals.js';
import type { RegistryPackage } from '../../registry/domain/package.js';
import {
  SearchCatalogService,
  type SearchCatalogResult,
} from '../../registry/application/searchCatalogService.js';
import { formatCatalogUpdatedAt } from '../../registry/application/registrySelectors.js';
import { handleCliError } from './cliErrorHandling.js';

export interface SearchCommandOptions {
  readonly interactive?: boolean;
}

const DESCRIPTION_MAX_LENGTH = 72;

const truncateDescription = (value: string): string => {
  if (value.length <= DESCRIPTION_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, DESCRIPTION_MAX_LENGTH - 1)}…`;
};

const packageToJsonFields = (pkg: RegistryPackage): Record<string, unknown> => ({
  id: pkg.id,
  name: pkg.name,
  description: pkg.description,
  latest: pkg.latest,
  status: pkg.status,
  owner: pkg.owner,
});

const writeSearchWarnings = (
  warnings: readonly string[],
  options: { readonly json: boolean; readonly interactive: boolean },
): void => {
  if (options.json && !options.interactive) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

const writeSearchVerboseMeta = (result: SearchCatalogResult, verbose: boolean): void => {
  if (!verbose) {
    return;
  }

  process.stderr.write(`index: ${result.indexUrl}\n`);
  process.stderr.write(`catalog updated: ${formatCatalogUpdatedAt(result.updatedAt)}\n`);
  process.stderr.write(`matches: ${result.packages.length}\n`);
};

const writeSearchTextResults = (packages: readonly RegistryPackage[]): void => {
  if (packages.length === 0) {
    process.stdout.write('No packages matched your search.\n');
    return;
  }

  for (const pkg of packages) {
    const description = truncateDescription(pkg.description);
    process.stdout.write(`${pkg.id}@${pkg.latest}  ${description}\n`);
  }
};

const writeSearchJsonResults = (result: SearchCatalogResult): void => {
  process.stdout.write(
    `${JSON.stringify({
      query: result.query,
      indexUrl: result.indexUrl,
      updatedAt: result.updatedAt,
      warnings: result.warnings,
      packages: result.packages.map((pkg) => packageToJsonFields(pkg)),
    })}\n`,
  );
};

const writeSelectedPackage = (packageId: string, json: boolean): void => {
  if (json) {
    process.stdout.write(`${JSON.stringify({ selected: packageId })}\n`);
    return;
  }

  process.stdout.write(`Selected ${packageId}\n`);
  process.stdout.write(`Install with: agents-repo install ${packageId}\n`);
};

export interface InteractivePackagePickerDeps {
  readonly autocomplete: typeof clack.autocomplete;
  readonly isCancel: typeof clack.isCancel;
  readonly cancel: typeof clack.cancel;
}

const defaultInteractiveDeps = (): InteractivePackagePickerDeps => ({
  autocomplete: clack.autocomplete,
  isCancel: clack.isCancel,
  cancel: clack.cancel,
});

export const pickPackageInteractively = async (
  packages: readonly RegistryPackage[],
  options: {
    readonly deps?: InteractivePackagePickerDeps;
    readonly jsonStdout?: boolean;
  } = {},
): Promise<string | null> => {
  const deps = options.deps ?? defaultInteractiveDeps();
  const promptOutput = options.jsonStdout ? process.stderr : undefined;
  const cancelOptions = promptOutput ? { output: promptOutput } : undefined;

  if (packages.length === 0) {
    deps.cancel('No packages matched your search.', cancelOptions);
    return null;
  }

  const selection = await deps.autocomplete({
    message: 'Select a package',
    output: promptOutput,
    options: packages.map((pkg) => ({
      value: pkg.id,
      label: `${pkg.id} — ${pkg.name}`,
    })),
  });

  if (deps.isCancel(selection)) {
    deps.cancel('Search cancelled.', cancelOptions);
    return null;
  }

  return typeof selection === 'string' ? selection : null;
};

const assertInteractiveTty = (): void => {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return;
  }

  const error = new Error('--interactive requires an interactive terminal (TTY)');
  error.name = 'InvalidUsageError';
  throw error;
};

const handleInvalidUsageError = (error: Error, json: boolean): never => {
  if (json) {
    process.stderr.write(
      `${JSON.stringify({
        error: { code: 'invalid_usage', message: error.message },
      })}\n`,
    );
  } else {
    process.stderr.write(`${error.message}\n`);
  }
  process.exit(2);
};

export const registerSearchCommand = (program: Command): void => {
  program
    .command('search [query]')
    .alias('find')
    .description('Search the registry catalog')
    .option('--interactive', 'Browse and select a package interactively')
    .action(async function searchAction(
      this: Command,
      query: string | undefined,
      options: SearchCommandOptions,
    ) {
      const globals = getCliGlobals();
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>();
      const interactive = options.interactive === true;

      const runOptions = {
        query: query ?? '',
        yes: rootOpts.yes ?? globals.yes ?? false,
      };

      try {
        if (interactive) {
          assertInteractiveTty();
        }

        const service = new SearchCatalogService();
        const result = await service.run(runOptions);

        writeSearchWarnings(result.warnings, { json: globals.json, interactive });
        writeSearchVerboseMeta(result, globals.verbose);

        if (interactive) {
          const selected = await pickPackageInteractively(result.packages, {
            jsonStdout: globals.json,
          });
          if (selected === null) {
            process.exit(1);
            return;
          }

          writeSelectedPackage(selected, globals.json);
          return;
        }

        if (globals.json) {
          writeSearchJsonResults(result);
          return;
        }

        writeSearchTextResults(result.packages);
      } catch (error) {
        if (error instanceof Error && error.name === 'InvalidUsageError') {
          return handleInvalidUsageError(error, globals.json);
        }

        handleCliError(error);
      }
    });
};
