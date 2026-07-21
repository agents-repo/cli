import { describe, expect, it } from 'vitest'

import { SchemaGate } from '../../../src/modules/config/application/schemaGate.js'
import { ConfigParseError } from '../../../src/modules/config/domain/configErrors.js'
import { parseJsonDocument } from '../../../src/modules/config/infrastructure/jsonDocument.js'

describe('SchemaGate', () => {
  const gate = new SchemaGate()

  it('selects greenfield for null document', () => {
    expect(gate.determineMode(null)).toBe('greenfield')
  })

  it('selects greenfield for empty object', () => {
    expect(gate.determineMode({})).toBe('greenfield')
  })

  it('selects top-level-ours for supported schemaVersion', () => {
    expect(gate.determineMode({ schemaVersion: '1.0.0', packages: {} })).toBe('top-level-ours')
  })

  it('selects namespace for foreign-only JSON', () => {
    expect(gate.determineMode({ customTool: { enabled: true } })).toBe('namespace')
  })

  it('selects namespace for alien schemaVersion', () => {
    expect(gate.determineMode({ schemaVersion: '9.9.9', target: 'cursor' })).toBe('namespace')
  })
})

describe('parseJsonDocument', () => {
  it('rejects whitespace-only content', () => {
    expect(() => parseJsonDocument('   ', 'agents.json')).toThrow(ConfigParseError)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseJsonDocument('{invalid', 'agents.json')).toThrow(ConfigParseError)
  })
})
