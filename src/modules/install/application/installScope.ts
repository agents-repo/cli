import os from 'node:os'
import path from 'node:path'

export interface InstallScope {
  readonly global: boolean
  readonly extractRoot: string
  readonly mutateProjectConfig: boolean
}

export const resolveInstallScope = (options: {
  readonly cwd: string
  readonly globalFlag?: boolean
  readonly configGlobal?: boolean
}): InstallScope => {
  const global = options.globalFlag === true || options.configGlobal === true
  const extractRoot = global
    ? path.join(os.homedir(), '.config', 'agents-repo')
    : options.cwd

  return {
    global,
    extractRoot,
    mutateProjectConfig: !global,
  }
}
