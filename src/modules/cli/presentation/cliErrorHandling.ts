import {
  ConfigConflictError,
  ConfigError,
  ConfigParseError,
  ConfigValidationError,
  LockValidationError,
} from '../../config/domain/configErrors.js';
import { TargetDetectionError } from '../../target/domain/targetDetectionErrors.js';

const formatConflictWarnings = (error: ConfigConflictError): string => {
  return error.conflicts.map((conflict) => conflict.message).join('\n');
};

const formatUnknownThrowable = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    return String(error);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

export const writeCliError = (error: unknown): void => {
  if (error instanceof ConfigConflictError) {
    process.stderr.write(`${error.message}\n`);
    if (error.conflicts.length > 0) {
      process.stderr.write(`${formatConflictWarnings(error)}\n`);
    }
    return;
  }

  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
    return;
  }

  if (error !== undefined && error !== null) {
    process.stderr.write(`${formatUnknownThrowable(error)}\n`);
  }
};

export const getCliExitCode = (error: unknown): number => {
  if (error instanceof ConfigError || error instanceof TargetDetectionError) {
    return error.exitCode;
  }

  if (error instanceof LockValidationError) {
    return error.exitCode;
  }

  return 1;
};

export const handleCliError = (error: unknown): never => {
  writeCliError(error);
  process.exit(getCliExitCode(error));
};

export const isConfigValidationError = (error: unknown): error is ConfigValidationError => {
  return error instanceof ConfigValidationError;
};

export const isConfigParseError = (error: unknown): error is ConfigParseError => {
  return error instanceof ConfigParseError;
};
