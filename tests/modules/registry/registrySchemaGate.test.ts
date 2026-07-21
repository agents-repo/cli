import { describe, expect, it } from 'vitest'
import { IndexSchemaError, ManifestSchemaError } from '../../../src/modules/registry/domain/errors.js'
import {
  assertIndexSchemaVersion,
  assertManifestSchemaVersion,
} from '../../../src/modules/registry/infrastructure/registrySchemaGate.js'

describe('registrySchemaGate', () => {
  it('accepts supported index schema versions and warns on deprecated', () => {
    expect(assertIndexSchemaVersion('1.3.0')).toEqual({ warnings: [] })
    expect(assertIndexSchemaVersion('1.0.0').warnings[0]).toContain('deprecated')
  })

  it('rejects unsupported index schema versions', () => {
    expect(() => assertIndexSchemaVersion('9.9.9')).toThrow(IndexSchemaError)
  })

  it('accepts supported manifest schema versions', () => {
    expect(() => assertManifestSchemaVersion('1.1.0')).not.toThrow()
  })

  it('rejects eol manifest schema versions', () => {
    expect(() => assertManifestSchemaVersion('1.0.0')).toThrow(ManifestSchemaError)
  })

  it('rejects unknown manifest schema versions', () => {
    expect(() => assertManifestSchemaVersion('2.0.0')).toThrow(ManifestSchemaError)
  })
})
