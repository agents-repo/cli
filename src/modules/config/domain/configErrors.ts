export type ConfigExitCode = 3 | 4

export abstract class ConfigError extends Error {
  abstract readonly exitCode: ConfigExitCode
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ConfigParseError extends ConfigError {
  readonly exitCode = 3 as const
  readonly code = 'config_parse_error'

  constructor(message: string) {
    super(message)
  }
}

export type ConfigValidationCode =
  | 'type_mismatch'
  | 'invalid_enum'
  | 'invalid_semver_range'
  | 'missing_target'
  | 'config_path_not_absolute'

export class ConfigValidationError extends ConfigError {
  readonly exitCode = 3 as const
  readonly code: ConfigValidationCode

  constructor(message: string, code: ConfigValidationCode) {
    super(message)
    this.code = code
  }
}

export class ConfigConflictError extends ConfigError {
  readonly exitCode = 4 as const
  readonly code = 'dual_definition_mismatch'
  readonly conflicts: readonly ConfigConflictRecord[]

  constructor(message: string, conflicts: readonly ConfigConflictRecord[]) {
    super(message)
    this.conflicts = conflicts
  }
}

export interface ConfigConflictRecord {
  readonly code: ConfigConflictCode
  readonly path: string
  readonly message: string
  readonly severity: 'error' | 'warning'
}

export type ConfigConflictCode =
  | 'type_mismatch'
  | 'dual_definition_mismatch'
  | 'invalid_enum'
  | 'invalid_semver_range'

export class LockValidationError extends ConfigError {
  readonly exitCode = 3 as const
  readonly code = 'lock_validation_error'

  constructor(message: string) {
    super(message)
  }
}
