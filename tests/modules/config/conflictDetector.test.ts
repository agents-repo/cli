import { describe, expect, it } from 'vitest'

import { ConflictDetector } from '../../../src/modules/config/application/conflictDetector.js'
import {
  ConfigConflictError,
  ConfigValidationError,
} from '../../../src/modules/config/domain/configErrors.js'

describe('ConflictDetector', () => {
  const detector = new ConflictDetector()

  it('reports type_mismatch for packages array in active target', () => {
    const result = detector.detect(
      { schemaVersion: '1.0.0', packages: [] },
      'top-level-ours',
    )

    expect(result.errors.some((entry) => entry.code === 'type_mismatch')).toBe(true)
  })

  it('reports invalid_enum for unsupported target', () => {
    const result = detector.detect(
      { schemaVersion: '1.0.0', target: 'unknown-target' },
      'top-level-ours',
    )

    expect(result.errors.some((entry) => entry.code === 'invalid_enum')).toBe(true)
  })

  it('reports invalid_semver_range for bad package ranges', () => {
    const result = detector.detect(
      {
        schemaVersion: '1.0.0',
        packages: { 'agents-repo/hello-agent': 'not-a-range' },
      },
      'top-level-ours',
    )

    expect(result.errors.some((entry) => entry.code === 'invalid_semver_range')).toBe(true)
  })

  it('reports dual_definition_mismatch only in top-level-ours mode', () => {
    const result = detector.detect(
      {
        schemaVersion: '1.0.0',
        target: 'cursor',
        '@agents-repo': { target: 'claude-code' },
      },
      'top-level-ours',
    )

    expect(result.errors.some((entry) => entry.code === 'dual_definition_mismatch')).toBe(true)
  })

  it('ignores inactive namespace block type errors in top-level-ours mode', () => {
    const result = detector.detect(
      {
        schemaVersion: '1.0.0',
        target: 'cursor',
        '@agents-repo': { packages: [] },
      },
      'top-level-ours',
    )

    expect(result.errors).toHaveLength(0)
  })

  it('does not check dual_definition in namespace mode', () => {
    const result = detector.detect(
      {
        target: 'cursor',
        '@agents-repo': { target: 'claude-code' },
      },
      'namespace',
    )

    expect(result.errors.some((entry) => entry.code === 'dual_definition_mismatch')).toBe(false)
  })

  it('throws ConfigConflictError for dual_definition when not waived', () => {
    expect(() =>
      detector.detectOrThrow(
        {
          schemaVersion: '1.0.0',
          target: 'cursor',
          '@agents-repo': { target: 'claude-code' },
        },
        'top-level-ours',
      ),
    ).toThrow(ConfigConflictError)
  })

  it('downgrades dual_definition to warnings when waived', () => {
    const warnings = detector.detectOrThrow(
      {
        schemaVersion: '1.0.0',
        target: 'cursor',
        '@agents-repo': { target: 'claude-code' },
      },
      'top-level-ours',
      { waiveConflicts: true },
    )

    expect(warnings.some((entry) => entry.code === 'dual_definition_mismatch')).toBe(true)
  })

  it('throws ConfigValidationError for type_mismatch', () => {
    expect(() =>
      detector.detectOrThrow(
        { schemaVersion: '1.0.0', packages: [] },
        'top-level-ours',
      ),
    ).toThrow(ConfigValidationError)
  })

  it('prioritizes validation errors over dual_definition_mismatch', () => {
    expect(() =>
      detector.detectOrThrow(
        {
          schemaVersion: '1.0.0',
          target: 'cursor',
          packages: [],
          '@agents-repo': { target: 'claude-code' },
        },
        'top-level-ours',
      ),
    ).toThrow(ConfigValidationError)
  })

  it('does not report dual_definition when registry objects differ only by key order', () => {
    const result = detector.detect(
      {
        schemaVersion: '1.0.0',
        registry: { ref: 'v2.x', url: 'https://registry-proxy.maiconfz.workers.dev' },
        packages: {},
        '@agents-repo': {
          registry: { url: 'https://registry-proxy.maiconfz.workers.dev', ref: 'v2.x' },
        },
      },
      'top-level-ours',
    )

    expect(result.errors.some((entry) => entry.code === 'dual_definition_mismatch')).toBe(false)
  })
})
