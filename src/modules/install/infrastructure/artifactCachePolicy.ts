import { ENV_AGENTS_REPO_NO_CACHE } from '../../config/domain/configConstants.js'

export const isArtifactCacheDisabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const value = env[ENV_AGENTS_REPO_NO_CACHE]?.trim()
  return value !== undefined && value.length > 0
}

export const shouldReadArtifactCache = (
  env: NodeJS.ProcessEnv,
  preferOnline: boolean,
): boolean => !isArtifactCacheDisabled(env) && !preferOnline

export const shouldWriteArtifactCache = (
  env: NodeJS.ProcessEnv,
  writeCache: boolean,
): boolean => writeCache && !isArtifactCacheDisabled(env)
