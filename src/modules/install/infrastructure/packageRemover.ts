import { createHash } from 'node:crypto'
import { lstat, readFile, rm, rmdir } from 'node:fs/promises'
import path from 'node:path'

import type { InstallTargetId } from '../../registry/domain/package.js'
import { installTargetPruneBoundary } from './installTargetPruneBoundary.js'

export interface RemoveFilesOptions {
  readonly force?: boolean
}

export interface RemoveFilesResult {
  readonly deletedPaths: readonly string[]
  readonly warnings: readonly string[]
}

const isEnoentError = (error: unknown): error is NodeJS.ErrnoException => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const sha256HexOfFile = async (filePath: string): Promise<string> => {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

const pruneEmptyParents = async (
  filePath: string,
  extractRoot: string,
  targetId: InstallTargetId,
): Promise<void> => {
  const boundary = path.resolve(extractRoot, installTargetPruneBoundary(targetId))
  let current = path.dirname(path.resolve(filePath))

  const resolvedRoot = path.resolve(extractRoot)
  while (current !== resolvedRoot && current.startsWith(resolvedRoot + path.sep)) {
    if (current === boundary) {
      break
    }

    try {
      await rmdir(current)
    } catch {
      break
    }

    current = path.dirname(current)
  }
}

export const removeInstalledFiles = async (
  filePaths: readonly string[],
  extractRoot: string,
  targetId: InstallTargetId,
  expectedHexByRelativePath: ReadonlyMap<string, string>,
  options: RemoveFilesOptions = {},
): Promise<RemoveFilesResult> => {
  const force = options.force === true
  const warnings: string[] = []
  const deletedPaths: string[] = []
  const resolvedRoot = path.resolve(extractRoot)

  for (const absolutePath of filePaths) {
    const relative = path.relative(resolvedRoot, absolutePath).split(path.sep).join('/')
    const expectedHex = expectedHexByRelativePath.get(relative)

    try {
      const stats = await lstat(absolutePath)
      if (!stats.isFile()) {
        warnings.push(`Skipped non-file path: ${relative}`)
        continue
      }

      if (expectedHex !== undefined && !force) {
        const actualHex = await sha256HexOfFile(absolutePath)
        if (actualHex !== expectedHex) {
          warnings.push(`Skipped modified file (use --force to delete): ${relative}`)
          continue
        }
      }
    } catch (error) {
      if (isEnoentError(error)) {
        warnings.push(`File already absent: ${relative}`)
        continue
      }

      throw error
    }

    await rm(absolutePath, { force: true })
    deletedPaths.push(absolutePath)
    await pruneEmptyParents(absolutePath, resolvedRoot, targetId)
  }

  return { deletedPaths, warnings }
}
