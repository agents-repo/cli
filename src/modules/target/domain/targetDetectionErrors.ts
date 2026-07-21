export type TargetDetectionErrorCode = 'project_root_unavailable'

export class TargetDetectionError extends Error {
  readonly exitCode = 3 as const
  readonly code: TargetDetectionErrorCode

  constructor(message: string, code: TargetDetectionErrorCode) {
    super(message)
    this.name = new.target.name
    this.code = code
  }
}
