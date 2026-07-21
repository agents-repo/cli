export const CONFIG_SCHEMA_VERSION = '1.0.0'

export const SUPPORTED_CONFIG_SCHEMA_VERSIONS = [CONFIG_SCHEMA_VERSION] as const

export type SupportedConfigSchemaVersion = (typeof SUPPORTED_CONFIG_SCHEMA_VERSIONS)[number]

export const LOCKFILE_VERSION = 1

export const AGENTS_REPO_NAMESPACE = '@agents-repo'

export const CLI_MANAGED_KEYS = [
  'schemaVersion',
  'registry',
  'target',
  'packages',
  'global',
] as const

export type CliManagedKey = (typeof CLI_MANAGED_KEYS)[number]

export const REGISTRY_URL_MIGRATION_KEY = 'registryUrl'

export const DEFAULT_REGISTRY_REF = 'v2.x'

export const AGENTS_JSON_FILENAME = 'agents.json'

export const AGENTS_LOCK_FILENAME = 'agents-lock.json'

export const ENV_AGENTS_REPO_CONFIG = 'AGENTS_REPO_CONFIG'

export const ENV_AGENTS_REPO_REGISTRY_URL = 'AGENTS_REPO_REGISTRY_URL'
