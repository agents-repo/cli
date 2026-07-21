import { describe, expect, it } from 'vitest'

import { valuesAreEqual } from '../../../src/modules/config/infrastructure/jsonDocument.js'

describe('jsonDocument.valuesAreEqual', () => {
  it('treats objects with different key order as equal', () => {
    expect(
      valuesAreEqual(
        { url: 'https://example.com', ref: 'v2.x' },
        { ref: 'v2.x', url: 'https://example.com' },
      ),
    ).toBe(true)
  })
})
