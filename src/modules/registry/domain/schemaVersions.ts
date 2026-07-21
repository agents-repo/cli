// Vendored from https://github.com/agents-repo/registry/blob/main/specs/schema-versions.json
// Update when registry schema lifecycle changes.

export const INDEX_SCHEMA_VERSIONS = {
  current: '1.3.0',
  supported: ['1.0.0', '1.1.0', '1.2.0', '1.3.0'] as const,
  deprecated: ['1.0.0'] as const,
  eol: [] as const,
} as const

export const MANIFEST_SCHEMA_VERSIONS = {
  current: '1.1.0',
  supported: ['1.1.0'] as const,
  deprecated: [] as const,
  eol: ['1.0.0'] as const,
} as const
