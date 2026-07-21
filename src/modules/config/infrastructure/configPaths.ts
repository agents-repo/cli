import path from 'node:path'

import {
  AGENTS_JSON_FILENAME,
  AGENTS_LOCK_FILENAME,
  ENV_AGENTS_REPO_CONFIG,
} from '../domain/configConstants.js'
import { ConfigValidationError } from '../domain/configErrors.js'

export interface ConfigPaths {
  readonly configPath: string
  readonly lockPath: string
}

export const resolveConfigPaths = (cwd: string, env: NodeJS.ProcessEnv = process.env): ConfigPaths => {
  const configOverride = env[ENV_AGENTS_REPO_CONFIG]?.trim()

  if (configOverride) {
    if (!path.isAbsolute(configOverride)) {
      throw new ConfigValidationError(
        `${ENV_AGENTS_REPO_CONFIG} must be an absolute path`,
        'config_path_not_absolute',
      )
    }

    if (path.basename(configOverride) !== AGENTS_JSON_FILENAME) {
      throw new ConfigValidationError(
        `${ENV_AGENTS_REPO_CONFIG} must be an absolute path to ${AGENTS_JSON_FILENAME}`,
        'config_path_not_agents_json',
      )
    }

    const configPath = configOverride
    const lockPath = path.join(path.dirname(configPath), AGENTS_LOCK_FILENAME)
    return { configPath, lockPath }
  }

  const configPath = path.join(cwd, AGENTS_JSON_FILENAME)
  const lockPath = path.join(cwd, AGENTS_LOCK_FILENAME)
  return { configPath, lockPath }
}
