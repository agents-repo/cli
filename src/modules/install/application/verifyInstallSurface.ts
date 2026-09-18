import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { AgentsLockDocument } from '../../config/domain/agentsLock.js'
import type { InstallTargetId } from '../../registry/domain/package.js'
import { installTargetPruneBoundary } from '../infrastructure/installTargetPruneBoundary.js'

export class VerifyInstallSurfaceError extends Error {
  readonly code = 'install_surface_missing'
  readonly exitCode = 3 as const

  constructor(message: string) {
    super(message)
    this.name = 'VerifyInstallSurfaceError'
  }
}

const listRelativeFilesSafe = (
  directory: string,
  relativePrefix: string,
  maxDepth: number,
  depth = 0,
): string[] => {
  if (depth > maxDepth || !existsSync(directory)) {
    return []
  }

  const files: string[] = []
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, dirent.name)
    const relative = relativePrefix.length === 0 ? dirent.name : `${relativePrefix}/${dirent.name}`
    if (dirent.isDirectory()) {
      files.push(...listRelativeFilesSafe(absolute, relative, maxDepth, depth + 1))
    } else if (dirent.isFile()) {
      files.push(relative)
    }
  }

  return files
}

const hasCopilotInstallSurface = (
  extractRoot: string,
  namespace: string,
  packageName: string,
  pathEncodingVersion?: number,
): boolean => {
  const agentsDir = path.join(extractRoot, '.github/agents')
  if (!existsSync(agentsDir)) {
    return false
  }

  const files = listRelativeFilesSafe(agentsDir, '', 4)
  const qualifiedNeedle = `${namespace}--${packageName}--`
  if (pathEncodingVersion === 1) {
    return files.some(
      (file) => file.endsWith('.agent.md') && file.includes(qualifiedNeedle),
    )
  }

  return files.some(
    (file) =>
      file.endsWith('.agent.md')
      && (file.includes(`${namespace}/`) || file.includes(`${namespace}-`) || file.includes(namespace)),
  )
}

const hasSkillTreeInstallSurface = (
  extractRoot: string,
  boundary: string,
  namespace: string,
  packageName: string,
  pathEncodingVersion?: number,
): boolean => {
  const root = path.join(extractRoot, boundary)
  if (!existsSync(root)) {
    return false
  }

  const namespaceDir = path.join(root, namespace)
  if (!existsSync(namespaceDir)) {
    return false
  }

  const files = listRelativeFilesSafe(namespaceDir, namespace, 5)
  const qualifiedNeedle = `${namespace}--${packageName}--`
  if (pathEncodingVersion === 1) {
    return files.some((file) => file.includes(qualifiedNeedle) && file.endsWith('SKILL.md'))
  }

  return files.some(
    (file) =>
      file.includes(`/${packageName}/`)
      || file.includes(`/${packageName}-`)
      || file.endsWith('/SKILL.md'),
  )
}

const hasClaudeInstallSurface = (
  extractRoot: string,
  namespace: string,
  packageName: string,
  pathEncodingVersion?: number,
): boolean => {
  const root = path.join(extractRoot, '.claude/agents')
  if (!existsSync(root)) {
    return false
  }

  const files = listRelativeFilesSafe(root, '', 5)
  const qualifiedNeedle = `${namespace}--${packageName}--`
  if (pathEncodingVersion === 1) {
    return files.some((file) => file.endsWith('.md') && file.includes(qualifiedNeedle))
  }

  const namespaceDir = path.join(root, namespace)
  return existsSync(namespaceDir) && files.some((file) => file.startsWith(`${namespace}/`) && file.endsWith('.md'))
}

export const hasPackageInstallSurface = (options: {
  readonly extractRoot: string
  readonly packageId: string
  readonly target: InstallTargetId
  readonly pathEncodingVersion?: number
}): boolean => {
  const slash = options.packageId.indexOf('/')
  if (slash <= 0 || slash === options.packageId.length - 1) {
    return false
  }

  const namespace = options.packageId.slice(0, slash)
  const packageName = options.packageId.slice(slash + 1)

  if (options.target === 'github-copilot') {
    return hasCopilotInstallSurface(
      options.extractRoot,
      namespace,
      packageName,
      options.pathEncodingVersion,
    )
  }

  if (options.target === 'claude-code') {
    return hasClaudeInstallSurface(
      options.extractRoot,
      namespace,
      packageName,
      options.pathEncodingVersion,
    )
  }

  const boundary = installTargetPruneBoundary(options.target)
  return hasSkillTreeInstallSurface(
    options.extractRoot,
    boundary,
    namespace,
    packageName,
    options.pathEncodingVersion,
  )
}

export const assertInstallSurfacesExist = (options: {
  readonly extractRoot: string
  readonly packageIds: readonly string[]
  readonly targets: readonly InstallTargetId[]
  readonly lock: AgentsLockDocument
}): void => {
  for (const packageId of options.packageIds) {
    if (!Object.hasOwn(options.lock.packages, packageId)) {
      throw new VerifyInstallSurfaceError(`Lock entry missing for ${packageId}`)
    }

    const entry = options.lock.packages[packageId]

    for (const target of options.targets) {
      if (entry.byTarget[target] === undefined) {
        continue
      }

      if (
        !hasPackageInstallSurface({
          extractRoot: options.extractRoot,
          packageId,
          target,
          pathEncodingVersion: entry.pathEncodingVersion,
        })
      ) {
        throw new VerifyInstallSurfaceError(
          `Missing install surface for ${packageId} (target ${target})`,
        )
      }
    }
  }
}
