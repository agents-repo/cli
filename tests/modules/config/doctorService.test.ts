import { describe, expect, it } from 'vitest'

import {
  computeDoctorExitCode,
  exitCodeForDoctorError,
  type DoctorCheck,
} from '../../../src/modules/config/application/doctorService.js'
import { ConfigValidationError } from '../../../src/modules/config/domain/configErrors.js'
import { IndexSchemaError, RegistryFetchError } from '../../../src/modules/registry/domain/errors.js'
import { InstallRuntimeError } from '../../../src/modules/install/domain/installErrors.js'

describe('computeDoctorExitCode', () => {
  it('returns 0 when all checks pass or skip', () => {
    const checks: DoctorCheck[] = [
      { id: 'config_schema', status: 'pass', message: 'ok' },
      { id: 'install_paths', status: 'skip', message: 'skipped' },
    ]

    expect(computeDoctorExitCode(checks)).toBe(0)
  })

  it('returns the highest exit code among failed checks', () => {
    const checks: DoctorCheck[] = [
      {
        id: 'registry_reachable',
        status: 'fail',
        message: 'network',
        exitCode: 1,
      },
      {
        id: 'lock_present',
        status: 'fail',
        message: 'missing lock',
        exitCode: 3,
      },
    ]

    expect(computeDoctorExitCode(checks)).toBe(3)
  })
})

describe('exitCodeForDoctorError', () => {
  it('maps config validation errors to exit 3', () => {
    expect(
      exitCodeForDoctorError(
        new ConfigValidationError('Install target is required', 'missing_target'),
      ),
    ).toBe(3)
  })

  it('maps registry fetch errors to exit 1', () => {
    expect(exitCodeForDoctorError(new RegistryFetchError('fetch failed', 503))).toBe(1)
  })

  it('maps index schema errors to exit 3', () => {
    expect(exitCodeForDoctorError(new IndexSchemaError('unsupported', '2.0.0'))).toBe(3)
  })

  it('maps integrity mismatch to exit 3', () => {
    expect(
      exitCodeForDoctorError(new InstallRuntimeError('integrity_mismatch', 'SHA-256 mismatch')),
    ).toBe(3)
  })
})
