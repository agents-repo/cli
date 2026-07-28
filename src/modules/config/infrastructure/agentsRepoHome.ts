import os from 'node:os'
import path from 'node:path'

import { ENV_AGENTS_REPO_HOME } from '../domain/configConstants.js'

export const resolveAgentsRepoHome = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env[ENV_AGENTS_REPO_HOME]?.trim()
  if (override !== undefined && override.length > 0) {
    return override
  }

  const homedir =
    env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir()

  return path.join(homedir, '.agents-repo')
}
