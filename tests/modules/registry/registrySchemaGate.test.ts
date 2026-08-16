import { describe, expect, it } from 'vitest'
import { IndexSchemaError, ManifestSchemaError } from '../../../src/modules/registry/domain/errors.js'
import {
  assertIndexSchemaVersion,
  assertManifestSchemaVersion,
} from '../../../src/modules/registry/infrastructure/registrySchemaGate.js'

describe('registrySchemaGate', () => {
  it('accepts supported index schema versions and warns on deprecated', () => {
    expect(assertIndexSchemaVersion('1.4.0')).toEqual({ warnings: [] })
    expect(assertIndexSchemaVersion('1.3.0')).toEqual({ warnings: [] })
    expect(assertIndexSchemaVersion('1.0.0').warnings[0]).toBe(
      'Index schemaVersion "1.0.0" is deprecated; consider upgrading catalog consumers',
    )
  })

  it('warns and proceeds for unknown same-major newer index schema versions', () => {
    expect(assertIndexSchemaVersion('1.5.0')).toEqual({
      warnings: [
        'Index schemaVersion "1.5.0" is newer than this CLI; consider upgrading agents-repo',
      ],
    })
    expect(assertIndexSchemaVersion('1.4.1').warnings[0]).toContain('newer than this CLI')
  })

  it('rejects unsupported index schema versions', () => {
    expect(() => assertIndexSchemaVersion('9.9.9')).toThrow(IndexSchemaError)
    expect(() => assertIndexSchemaVersion('2.0.0')).toThrow(IndexSchemaError)
    expect(() => assertIndexSchemaVersion('1.3.5')).toThrow(IndexSchemaError)
    expect(() => assertIndexSchemaVersion('not-a-version')).toThrow(IndexSchemaError)
  })

  it('accepts supported manifest schema versions', () => {
    expect(assertManifestSchemaVersion('1.1.0')).toEqual({ warnings: [] })
    expect(assertManifestSchemaVersion('1.2.0')).toEqual({ warnings: [] })
  })

  it('warns and proceeds for unknown same-major newer manifest schema versions', () => {
    expect(assertManifestSchemaVersion('1.3.0')).toEqual({
      warnings: [
        'Manifest schemaVersion "1.3.0" is newer than this CLI; consider upgrading agents-repo',
      ],
    })
  })

  it('rejects eol manifest schema versions', () => {
    expect(() => assertManifestSchemaVersion('1.0.0')).toThrow(ManifestSchemaError)
  })

  it('rejects unknown manifest schema versions', () => {
    expect(() => assertManifestSchemaVersion('2.0.0')).toThrow(ManifestSchemaError)
  })
})
