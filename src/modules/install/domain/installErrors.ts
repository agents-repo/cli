export class InstallZipSecurityError extends Error {
  readonly code: string
  readonly exitCode = 1 as const

  constructor(code: string, message: string) {
    super(message)
    this.name = 'InstallZipSecurityError'
    this.code = code
  }
}

export class InstallRuntimeError extends Error {
  readonly code: string
  readonly exitCode = 1 as const

  constructor(code: string, message: string) {
    super(message)
    this.name = 'InstallRuntimeError'
    this.code = code
  }
}
