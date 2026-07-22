import {
  ConfigConflictError,
  ConfigError,
  ConfigParseError,
  ConfigValidationError,
} from '../../config/domain/configErrors.js';
import {
  InstallTargetUnsupportedError,
  ManifestArtifactNotFoundError,
  MetadataSchemaError,
  NoMatchingVersionError,
  PackageNotFoundError,
  PackageYankedError,
  RegistryRefResolutionError,
} from '../../registry/domain/errors.js';
import { TargetDetectionError } from '../../target/domain/targetDetectionErrors.js';
import { InstallRuntimeError, InstallZipSecurityError } from '../../install/domain/installErrors.js';
import { getCliGlobals } from '../application/cliGlobals.js';

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
    const serialized = JSON.stringify(error);
    return typeof serialized === 'string' ? serialized : 'Unknown error';
  } catch {
    return 'Unknown error';
  }
};

const getErrorCode = (error: unknown): string | undefined => {
  if (error instanceof ConfigError) {
    return error.code;
  }

  if (error instanceof InstallZipSecurityError || error instanceof InstallRuntimeError) {
    return error.code;
  }

  if (
    error instanceof PackageYankedError ||
    error instanceof PackageNotFoundError ||
    error instanceof ManifestArtifactNotFoundError ||
    error instanceof InstallTargetUnsupportedError ||
    error instanceof NoMatchingVersionError ||
    error instanceof MetadataSchemaError ||
    error instanceof RegistryRefResolutionError
  ) {
    return error.name;
  }

  return undefined;
};

export const writeCliError = (error: unknown): void => {
  const globals = getCliGlobals();
  const code = getErrorCode(error);

  if (globals.json) {
    const message = error instanceof Error ? error.message : formatUnknownThrowable(error);
    process.stderr.write(`${JSON.stringify({ error: { code: code ?? 'runtime_error', message } })}\n`);
    return;
  }

  if (error instanceof ConfigConflictError) {
    process.stderr.write(`${error.message}\n`);
    if (error.conflicts.length > 0) {
      process.stderr.write(`${formatConflictWarnings(error)}\n`);
    }
    return;
  }

  if (error instanceof Error) {
    const prefix = code ? `[${code}] ` : '';
    process.stderr.write(`${prefix}${error.message}\n`);
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

  if (
    error instanceof PackageYankedError ||
    error instanceof PackageNotFoundError ||
    error instanceof ManifestArtifactNotFoundError ||
    error instanceof InstallTargetUnsupportedError ||
    error instanceof NoMatchingVersionError ||
    error instanceof MetadataSchemaError ||
    error instanceof RegistryRefResolutionError
  ) {
    return 3;
  }

  if (error instanceof InstallZipSecurityError || error instanceof InstallRuntimeError) {
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
