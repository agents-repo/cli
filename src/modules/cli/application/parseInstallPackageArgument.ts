import { singleInstallSelection, type InstallSelection } from '../../install/domain/installSelection.js'

export interface ParsedInstallPackageArgument {
  readonly packageRef: string
  readonly selection: InstallSelection | null
}

const invalidUsage = (message: string): Error => {
  const error = new Error(message)
  error.name = 'InvalidUsageError'
  return error
}

export const parseInstallPackageArgument = (raw: string): ParsedInstallPackageArgument => {
  const trimmed = raw.trim()
  const colonIndex = trimmed.indexOf(':')

  if (colonIndex === -1) {
    if (trimmed.length === 0) {
      throw invalidUsage('install package argument must not be empty')
    }
    return { packageRef: trimmed, selection: null }
  }

  const packageRef = trimmed.slice(0, colonIndex).trim()
  const selector = trimmed.slice(colonIndex + 1).trim()

  if (packageRef.length === 0) {
    throw invalidUsage('install package-id must appear before ":" in package-id:selector syntax')
  }

  if (selector.length === 0) {
    throw invalidUsage('install selector must not be empty in package-id:selector syntax')
  }

  return {
    packageRef,
    selection: singleInstallSelection(selector),
  }
}
