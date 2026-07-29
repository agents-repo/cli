import { resolveAgentsRepoHome } from '../../config/infrastructure/agentsRepoHome.js'

export interface InstallScope {
  readonly global: boolean
  readonly extractRoot: string
  readonly persistScopeConfig: boolean
}

export const resolveInstallScope = (options: {
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
  readonly globalFlag?: boolean
}): InstallScope => {
  const global = options.globalFlag === true
  const env = options.env ?? process.env
  const extractRoot = global ? resolveAgentsRepoHome(env) : options.cwd

  return {
    global,
    extractRoot,
    persistScopeConfig: true,
  }
}
