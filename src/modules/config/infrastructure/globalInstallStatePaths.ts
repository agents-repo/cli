import os from 'node:os'
import path from 'node:path'

import { AGENTS_GLOBAL_STATE_FILENAME } from '../domain/configConstants.js'

export const resolveGlobalInstallConfigDir = (env: NodeJS.ProcessEnv = process.env): string => {
  const homedir =
    env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir()

  return path.join(homedir, '.config', 'agents-repo')
}

export const resolveGlobalInstallStatePath = (env: NodeJS.ProcessEnv = process.env): string => {
  return path.join(resolveGlobalInstallConfigDir(env), AGENTS_GLOBAL_STATE_FILENAME)
}
