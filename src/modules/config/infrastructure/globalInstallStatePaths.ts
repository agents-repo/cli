import { resolveAgentsRepoHome } from './agentsRepoHome.js'

/** @deprecated Global state uses agents.json + agents-lock.json under agents repo home. */
export const resolveGlobalInstallConfigDir = (env: NodeJS.ProcessEnv = process.env): string => {
  return resolveAgentsRepoHome(env)
}
