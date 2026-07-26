import type { InstallResult } from '../../install/domain/installResult.js';

export interface InstallResultActionLabels {
  readonly applied: string;
  readonly dryRun: string;
}

export const INSTALL_RESULT_ACTION_LABELS: InstallResultActionLabels = {
  applied: 'Installed',
  dryRun: 'Would install',
};

export const UPDATE_RESULT_ACTION_LABELS: InstallResultActionLabels = {
  applied: 'Updated',
  dryRun: 'Would update',
};

export const formatInstallResultSuccess = (
  result: InstallResult,
  labels: InstallResultActionLabels,
): string => {
  const action = result.dryRun ? labels.dryRun : labels.applied;
  let saveSuffix = '';
  if (!result.saved && !result.dryRun && result.noSave) {
    saveSuffix = ' (not saved)';
  }
  return `${action} ${result.packageId}@${result.version} for target ${result.target} into ${result.extractRoot}${saveSuffix}`;
};

export const installResultToJson = (result: InstallResult): Record<string, unknown> => ({
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

export const collectInstallResultWarnings = (
  results: readonly InstallResult[],
): InstallResult['warnings'] => {
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

export const writeInstallResultWarnings = (
  warnings: InstallResult['warnings'],
  json: boolean,
): void => {
  if (json) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

export const writeSingleInstallResultSuccess = (
  result: InstallResult,
  json: boolean,
  labels: InstallResultActionLabels,
): void => {
  if (json) {
    process.stdout.write(`${JSON.stringify(installResultToJson(result))}\n`);
    return;
  }

  process.stdout.write(`${formatInstallResultSuccess(result, labels)}\n`);
};

export const writeBulkInstallResultSuccess = (
  results: readonly InstallResult[],
  json: boolean,
  labels: InstallResultActionLabels,
): void => {
  if (json) {
    const warnings = collectInstallResultWarnings(results);
    const packages = results.map((result) => ({
      ...installResultToJson(result),
      warnings: [],
    }));
    process.stdout.write(`${JSON.stringify({ warnings, packages })}\n`);
    return;
  }

  for (const result of results) {
    process.stdout.write(`${formatInstallResultSuccess(result, labels)}\n`);
  }
};
