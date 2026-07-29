import type { RemoveResult } from '../../install/domain/removeResult.js';

export interface RemoveResultActionLabels {
  readonly applied: string;
  readonly dryRun: string;
}

export const REMOVE_RESULT_ACTION_LABELS: RemoveResultActionLabels = {
  applied: 'Removed',
  dryRun: 'Would remove',
};

export const formatRemoveResultSuccess = (
  result: RemoveResult,
  labels: RemoveResultActionLabels,
): string => {
  const action = result.dryRun ? labels.dryRun : labels.applied;
  let saveSuffix = '';
  if (!result.saved && !result.dryRun && result.noSave) {
    saveSuffix = ' (not saved)';
  }
  const fileCount = result.deletedPaths.length;
  const fileLabel = fileCount === 1 ? 'file' : 'files';
  return `${action} ${result.packageId}@${result.version} for target ${result.target} (${fileCount} ${fileLabel}) from ${result.extractRoot}${saveSuffix}`;
};

export const removeResultToJson = (result: RemoveResult): Record<string, unknown> => ({
  packageId: result.packageId,
  version: result.version,
  target: result.target,
  extractRoot: result.extractRoot,
  artifactUrl: result.artifactUrl,
  saved: result.saved,
  dryRun: result.dryRun,
  global: result.global,
  noSave: result.noSave,
  deletedPaths: result.deletedPaths,
  warnings: result.warnings,
});

export const collectRemoveResultWarnings = (
  results: readonly RemoveResult[],
): RemoveResult['warnings'] => {
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

export const writeRemoveResultWarnings = (
  warnings: RemoveResult['warnings'],
  json: boolean,
): void => {
  if (json) {
    return;
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
};

export const writeBulkRemoveResultSuccess = (
  results: readonly RemoveResult[],
  json: boolean,
  labels: RemoveResultActionLabels,
): void => {
  if (json) {
    const warnings = collectRemoveResultWarnings(results);
    const packages = results.map((result) => ({
      ...removeResultToJson(result),
      warnings: [],
    }));
    process.stdout.write(`${JSON.stringify({ warnings, packages })}\n`);
    return;
  }

  for (const result of results) {
    process.stdout.write(`${formatRemoveResultSuccess(result, labels)}\n`);
  }
};
