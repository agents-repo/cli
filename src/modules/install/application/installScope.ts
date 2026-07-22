import os from 'node:os'
import path from 'node:path'

export interface InstallScope {
  readonly global: boolean
  readonly extractRoot: string
  readonly mutateProjectConfig: boolean
}

export const resolveInstallScope = (options: {
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
  readonly globalFlag?: boolean
  readonly configGlobal?: boolean
}): InstallScope => {
  const global = options.globalFlag === true || options.configGlobal === true
  const homedir =
    options.env?.HOME?.trim() ||
    options.env?.USERPROFILE?.trim() ||
    os.homedir()
  const extractRoot = global
    ? path.join(homedir, '.config', 'agents-repo')
    : options.cwd

  return {
    global,
    extractRoot,
    mutateProjectConfig: !global,
  }
}
